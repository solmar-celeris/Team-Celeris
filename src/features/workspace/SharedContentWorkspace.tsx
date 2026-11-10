import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowUpRight, Check, FileText, FolderOpen, Link2, Megaphone, Pin, PinOff, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import type { Area, MemberProfile } from './domain';
import { notifyWorkspacePush } from '../../lib/notifications';
import './shared-content.css';
import './announcement-interactions.css';

type ContentMode = 'files' | 'announcements';
type SharedContentWorkspaceProps = {
  client: SupabaseClient;
  mode: ContentMode;
  userId: string;
  isAdmin: boolean;
  areas: Pick<Area, 'id' | 'name'>[];
  members: Pick<MemberProfile, 'user_id' | 'full_name'>[];
  targetAnnouncementId?: string;
  areaId: string | null;
  isGeneralChannel: boolean;
};
type DriveFolder = {
  id: string;
  name: string;
  drive_url: string;
  description: string;
  area_id: string | null;
  is_primary: boolean;
  added_by: string | null;
  created_at: string;
};
type Announcement = {
  id: string;
  title: string;
  message: string;
  audience_area_id: string | null;
  author_id: string | null;
  pinned_at: string | null;
  created_at: string;
};
type AnnouncementReply = {
  id: string;
  announcement_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
};
type AnnouncementReaction = {
  id: string;
  announcement_id: string;
  user_id: string;
  emoji: string;
};
type AnnouncementAttachment = { id: string; announcement_id: string; storage_path: string; file_name: string; content_type: string; file_size: number; uploaded_by: string };
type AnnouncementDriveLink = { id: string; announcement_id: string; name: string; url: string; added_by: string };
type PollOption = { id: string; label: string; votes: number };
type AnnouncementPoll = { id: string; announcement_id: string; question: string; allow_multiple: boolean; closed_at: string | null; options: PollOption[]; my_option_ids: string[] };
type FolderForm = { name: string; driveUrl: string; areaId: string; description: string };
type AnnouncementForm = { title: string; message: string; areaId: string; driveName: string; driveUrl: string; pollEnabled: boolean; question: string; options: string[]; allowMultiple: boolean };

const emptyFolderForm: FolderForm = { name: '', driveUrl: '', areaId: '', description: '' };
const emptyAnnouncementForm: AnnouncementForm = { title: '', message: '', areaId: '', driveName: '', driveUrl: '', pollEnabled: false, question: '', options: ['', ''], allowMultiple: false };
const ANNOUNCEMENT_REACTIONS = ['👍', '❤️', '😂', '👏', '🔥'];
const MAX_ANNOUNCEMENT_FILE_SIZE = 15 * 1024 * 1024;
const ANNOUNCEMENT_FILE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif',
  'application/pdf': 'pdf', 'text/plain': 'txt', 'text/csv': 'csv', 'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx', 'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
};

function parseDriveLink(value: string): URL | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || !['drive.google.com', 'docs.google.com'].includes(url.hostname) || url.username || url.password || url.port || !url.pathname.startsWith('/')) return null;
    return url;
  } catch { return null; }
}

function formatFileSize(size: number): string {
  return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function errorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return 'Ocorreu um erro inesperado. Confira a conexão e tente novamente.';
  const candidate = error as { message?: string; code?: string };
  const message = candidate.message ?? '';
  if (candidate.code === '42501' || /row-level security|permission denied/i.test(message)) {
    return 'O Supabase ainda está bloqueando essa ação. Confirme que as migrations incrementais estão aplicadas no projeto certo; não desative o RLS.';
  }
  if (candidate.code === 'PGRST202' && /update_drive_folder/i.test(message)) {
    return 'A função segura de edição de pastas ainda não existe neste banco. Aplique a migration incremental de edição e publique o site atualizado.';
  }
  if ((candidate.code === 'PGRST204' || candidate.code === '42703') && /drive_folders/i.test(message) && /description/i.test(message)) {
    return 'A descrição/edição de pastas ainda não está habilitada neste banco. Aplique a migration 20261109213000_drive_folder_edit_description.sql.';
  }
  if (['42P01', 'PGRST202', 'PGRST204', 'PGRST205'].includes(candidate.code ?? '') || /announcement_(attachments|drive_links|polls|poll_options).*not found/i.test(message)) {
    return 'Anexos, links e enquetes de Comunicados ainda não estão habilitados neste banco. Aplique a migration 20261106194000_announcement_attachments_drive_polls.sql.';
  }
  if (['42P01', 'PGRST200', 'PGRST204', 'PGRST205'].includes(candidate.code ?? '') || /announcement_(replies|reactions).*not found/i.test(message)) {
    return 'As respostas e reações ainda não foram habilitadas neste banco. Aplique uma única vez a migration 20261104101500_announcement_replies_reactions.sql.';
  }
  if (candidate.code === '23505') return 'Essa reação já foi registrada. Atualize o comunicado para ver a contagem mais recente.';
  if (candidate.code === 'PGRST202' || /function .*remove_(drive_folder|announcement).*not found/i.test(message)) {
    return 'A função segura de remoção ainda não existe neste banco. Aplique a migration incremental mais recente e publique o site atualizado.';
  }
  if (/drive_folders_single_primary|duplicate key/i.test(message)) {
    return 'Outra pessoa definiu uma pasta principal ao mesmo tempo. Atualize a lista e tente de novo.';
  }
  return message || 'Ocorreu um erro inesperado. Confira a conexão e tente novamente.';
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function SharedContentWorkspace({ client, mode, userId, isAdmin, areas, members, targetAnnouncementId, areaId, isGeneralChannel }: SharedContentWorkspaceProps) {
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [folderFormOpen, setFolderFormOpen] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [announcementFormOpen, setAnnouncementFormOpen] = useState(false);
  const [folderForm, setFolderForm] = useState<FolderForm>(() => ({ ...emptyFolderForm, areaId: areaId ?? '' }));
  const [announcementForm, setAnnouncementForm] = useState<AnnouncementForm>(() => ({ ...emptyAnnouncementForm, areaId: areaId ?? '' }));
  const [confirmFolderId, setConfirmFolderId] = useState<string | null>(null);
  const [confirmAnnouncementId, setConfirmAnnouncementId] = useState<string | null>(null);
  const [pendingPrimaryId, setPendingPrimaryId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [announcementReplies, setAnnouncementReplies] = useState<AnnouncementReply[]>([]);
  const [announcementReactions, setAnnouncementReactions] = useState<AnnouncementReaction[]>([]);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [interactionError, setInteractionError] = useState('');
  const [interactionsLoading, setInteractionsLoading] = useState(true);
  const [interactionBusy, setInteractionBusy] = useState<string | null>(null);
  const [announcementAttachments, setAnnouncementAttachments] = useState<AnnouncementAttachment[]>([]);
  const [announcementDriveLinks, setAnnouncementDriveLinks] = useState<AnnouncementDriveLink[]>([]);
  const [announcementPolls, setAnnouncementPolls] = useState<Record<string, AnnouncementPoll>>({});
  const [pollSelections, setPollSelections] = useState<Record<string, string[]>>({});
  const [signedAttachmentUrls, setSignedAttachmentUrls] = useState<Record<string, string>>({});
  const [announcementFiles, setAnnouncementFiles] = useState<File[]>([]);

  useEffect(() => {
    setFolderForm({ ...emptyFolderForm, areaId: areaId ?? '' });
    setAnnouncementForm({ ...emptyAnnouncementForm, areaId: areaId ?? '' });
    setFolderFormOpen(false); setAnnouncementFormOpen(false); setEditingFolderId(null);
  }, [areaId]);

  const loadContent = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      if (!areaId && !isGeneralChannel) {
        if (mode === 'files') setFolders([]); else setAnnouncements([]);
        return;
      }
      if (mode === 'files') {
        let foldersQuery = client
          .from('drive_folders')
          .select('id,name,drive_url,description,area_id,is_primary,added_by,created_at')
          .is('removed_at', null);
        foldersQuery = areaId ? foldersQuery.eq('area_id', areaId) : foldersQuery.is('area_id', null);
        const { data, error: queryError } = await foldersQuery
          .order('is_primary', { ascending: false })
          .order('created_at', { ascending: true });
        if (queryError) throw queryError;
        setFolders((data ?? []) as DriveFolder[]);
      } else {
        let announcementsQuery = client
          .from('announcements')
          .select('id,title,message,audience_area_id,author_id,pinned_at,created_at')
          .is('removed_at', null);
        announcementsQuery = areaId ? announcementsQuery.eq('audience_area_id', areaId) : announcementsQuery.is('audience_area_id', null);
        const { data, error: queryError } = await announcementsQuery
          .order('created_at', { ascending: false });
        if (queryError) throw queryError;
        const ordered = (data ?? []) as Announcement[];
        ordered.sort((a, b) => {
          if (Boolean(a.pinned_at) !== Boolean(b.pinned_at)) return a.pinned_at ? -1 : 1;
          if (a.pinned_at && b.pinned_at && a.pinned_at !== b.pinned_at) return b.pinned_at.localeCompare(a.pinned_at);
          return b.created_at.localeCompare(a.created_at);
        });
        setAnnouncements(ordered);
      }
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [areaId, client, isGeneralChannel, mode]);

  const announcementIds = useMemo(() => announcements.map(({ id }) => id).sort().join(','), [announcements]);
  const loadInteractions = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      setAnnouncementReplies([]);
      setAnnouncementReactions([]);
      setInteractionError('');
      setInteractionsLoading(false);
      return;
    }
    setInteractionsLoading(true);
    try {
      const [replyResult, reactionResult] = await Promise.all([
        client.from('announcement_replies')
          .select('id,announcement_id,author_id,body,created_at')
          .in('announcement_id', ids)
          .is('removed_at', null)
          .order('created_at', { ascending: true }),
        client.from('announcement_reactions')
          .select('id,announcement_id,user_id,emoji')
          .in('announcement_id', ids),
      ]);
      if (replyResult.error) throw replyResult.error;
      if (reactionResult.error) throw reactionResult.error;
      setAnnouncementReplies((replyResult.data ?? []) as AnnouncementReply[]);
      setAnnouncementReactions((reactionResult.data ?? []) as AnnouncementReaction[]);
      setInteractionError('');
    } finally {
      setInteractionsLoading(false);
    }
  }, [client]);

  const loadAnnouncementExtras = useCallback(async (ids: string[]) => {
    if (!ids.length) {
      setAnnouncementAttachments([]);
      setAnnouncementDriveLinks([]);
      setAnnouncementPolls({});
      return;
    }
    const [fileResult, linkResult] = await Promise.all([
      client.from('announcement_attachments').select('id,announcement_id,storage_path,file_name,content_type,file_size,uploaded_by').in('announcement_id', ids).order('created_at'),
      client.from('announcement_drive_links').select('id,announcement_id,name,url,added_by').in('announcement_id', ids).order('created_at'),
    ]);
    if (fileResult.error) throw fileResult.error;
    if (linkResult.error) throw linkResult.error;
    setAnnouncementAttachments((fileResult.data ?? []) as AnnouncementAttachment[]);
    setAnnouncementDriveLinks((linkResult.data ?? []) as AnnouncementDriveLink[]);
    const summaries = await Promise.all(ids.map(async (id) => {
      const { data, error: pollError } = await client.rpc('get_announcement_poll_results', { p_announcement_id: id });
      if (pollError) throw pollError;
      return data as AnnouncementPoll | null;
    }));
    const nextPolls: Record<string, AnnouncementPoll> = {};
    summaries.forEach((poll) => { if (poll) nextPolls[poll.announcement_id] = poll; });
    setAnnouncementPolls(nextPolls);
    setPollSelections((current) => Object.fromEntries(Object.entries(current).filter(([announcementId]) => ids.includes(announcementId))));
  }, [client]);

  useEffect(() => {
    if (mode !== 'announcements') return;
    const ids = announcementIds ? announcementIds.split(',') : [];
    let mounted = true;
    const refreshInteractions = () => {
      void loadInteractions(ids).catch((loadError) => {
        if (mounted) setInteractionError(errorMessage(loadError));
      });
    };
    refreshInteractions();
    if (ids.length === 0) return () => { mounted = false; };

    const channel = client
      .channel(`announcement-interactions-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcement_replies' }, refreshInteractions)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcement_reactions' }, refreshInteractions)
      .subscribe();
    return () => {
      mounted = false;
      void client.removeChannel(channel);
    };
  }, [announcementIds, client, loadInteractions, mode, userId]);

  useEffect(() => {
    if (mode !== 'announcements') return;
    const ids = announcementIds ? announcementIds.split(',') : [];
    void loadAnnouncementExtras(ids).catch((loadError) => setInteractionError(errorMessage(loadError)));
  }, [announcementIds, loadAnnouncementExtras, mode]);

  useEffect(() => {
    void loadContent(true);
  }, [loadContent]);

  useEffect(() => {
    if (mode !== 'announcements' || loading || !targetAnnouncementId) return;
    const card = document.getElementById(`announcement-card-${targetAnnouncementId}`);
    card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [loading, mode, targetAnnouncementId, announcements]);

  const areasById = useMemo(() => new Map(areas.map((area) => [area.id, area.name])), [areas]);
  const membersById = useMemo(() => new Map(members.map((member) => [member.user_id, member.full_name])), [members]);
  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
  const visibleFolders = folders.filter((folder) => !normalizedQuery || `${folder.name} ${folder.description} ${areasById.get(folder.area_id ?? '') ?? 'Geral'}`.toLocaleLowerCase('pt-BR').includes(normalizedQuery));
  const visibleAnnouncements = announcements.filter((item) => !normalizedQuery || `${item.title} ${item.message} ${areasById.get(item.audience_area_id ?? '') ?? 'Toda a equipe'}`.toLocaleLowerCase('pt-BR').includes(normalizedQuery));

  async function saveFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = folderForm.name.trim();
    const link = folderForm.driveUrl.trim();
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(link);
    } catch {
      setError('Cole um endereço completo da pasta do Google Drive.');
      return;
    }
    if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'drive.google.com' || parsedUrl.username || parsedUrl.password || parsedUrl.port || !parsedUrl.pathname.startsWith('/')) {
      setError('Use um link do Google Drive iniciado por https://drive.google.com/, sem usuário, senha ou porta personalizada.');
      return;
    }
    if (!name) {
      setError('Informe o nome da pasta.');
      return;
    }
    const description = folderForm.description.trim();
    if (description.length > 500) {
      setError('A descrição deve ter no máximo 500 caracteres.');
      return;
    }

    setSaving(true);
    setError('');
    setFeedback('');
    try {
      if (editingFolderId) {
        const { error: updateError } = await client.rpc('update_drive_folder', {
          p_folder_id: editingFolderId,
          p_name: name,
          p_drive_url: parsedUrl.toString(),
          p_area_id: areaId ?? (folderForm.areaId || null),
          p_description: description,
        });
        if (updateError) throw updateError;
      } else {
        const needsPrimary = !folders.some((folder) => folder.is_primary);
        const { error: insertError } = await client.from('drive_folders').insert({
          name,
          drive_url: parsedUrl.toString(),
          area_id: areaId ?? (folderForm.areaId || null),
          is_primary: needsPrimary,
        });
        if (insertError) throw insertError;
      }
      const wasEditing = Boolean(editingFolderId);
      setFolderForm({ ...emptyFolderForm, areaId: areaId ?? '' });
      setFolderFormOpen(false);
      setEditingFolderId(null);
      setFeedback(wasEditing ? 'Pasta atualizada. O link abre em uma nova aba; o site não acessa o conteúdo do Drive.' : 'Pasta adicionada. O link abre em uma nova aba; o site não acessa o conteúdo do Drive.');
      await loadContent(false);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  function editFolder(folder: DriveFolder) {
    setFolderForm({ name: folder.name, driveUrl: folder.drive_url, areaId: folder.area_id ?? '', description: folder.description ?? '' });
    setEditingFolderId(folder.id);
    setFolderFormOpen(true);
    setConfirmFolderId(null);
    setError('');
    setFeedback('');
  }

  async function setPrimary(folder: DriveFolder) {
    setPendingPrimaryId(folder.id);
    setError('');
    setFeedback('');
    const { error: rpcError } = await client.rpc('set_primary_drive_folder', { p_folder_id: folder.id });
    setPendingPrimaryId(null);
    if (rpcError) {
      setError(errorMessage(rpcError));
      return;
    }
    setFeedback(`“${folder.name}” agora é a pasta principal.`);
    await loadContent(false);
  }

  async function removeFolder(folder: DriveFolder) {
    setSaving(true);
    setError('');
    setFeedback('');
    const { error: rpcError } = await client.rpc('remove_drive_folder', { p_folder_id: folder.id });
    if (rpcError) {
      setError(errorMessage(rpcError));
    } else {
      setConfirmFolderId(null);
      setFeedback(`A pasta “${folder.name}” foi removida da lista. O conteúdo continua no Google Drive.`);
      await loadContent(false);
    }
    setSaving(false);
  }

  async function saveAnnouncement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = announcementForm.title.trim();
    const message = announcementForm.message.trim();
    if (!title || !message) {
      setError('Preencha o título e a mensagem.');
      return;
    }
    const driveName = announcementForm.driveName.trim();
    const driveUrl = announcementForm.driveUrl.trim();
    const parsedDriveUrl = driveUrl ? parseDriveLink(driveUrl) : null;
    if ((driveName && !driveUrl) || (!driveName && driveUrl) || (driveUrl && !parsedDriveUrl)) {
      setError('Informe nome e URL do link; use HTTPS em drive.google.com ou docs.google.com, sem usuário, senha ou porta personalizada.');
      return;
    }
    if (announcementFiles.some((file) => !ANNOUNCEMENT_FILE_EXTENSIONS[file.type] || file.size < 1 || file.size > MAX_ANNOUNCEMENT_FILE_SIZE)) {
      setError('Anexe apenas imagens ou documentos comuns aceitos, com até 15 MiB por arquivo.');
      return;
    }
    const pollOptions = announcementForm.options.map((option) => option.trim()).filter(Boolean);
    if (announcementForm.pollEnabled && (!announcementForm.question.trim() || pollOptions.length < 2 || pollOptions.length > 8 || pollOptions.length !== announcementForm.options.length || new Set(pollOptions.map((option) => option.toLocaleLowerCase('pt-BR'))).size !== pollOptions.length)) {
      setError('Informe uma pergunta e de 2 a 8 opções distintas e preenchidas para a enquete.');
      return;
    }
    setSaving(true);
    setError('');
    setFeedback('');
    let announcementId: string | null = null;
    try {
      if (announcementForm.pollEnabled) {
        const { data, error: publishError } = await client.rpc('publish_announcement_with_poll', {
          p_title: title, p_message: message, p_audience_area_id: areaId ?? (announcementForm.areaId || null),
          p_question: announcementForm.question.trim(), p_options: pollOptions, p_allow_multiple: announcementForm.allowMultiple,
        });
        if (publishError) throw publishError;
        announcementId = data as string;
      } else {
        const { data, error: insertError } = await client.from('announcements').insert({
          title, message, audience_area_id: areaId ?? (announcementForm.areaId || null),
        }).select('id').single();
        if (insertError) throw insertError;
        announcementId = data.id;
      }
      if (parsedDriveUrl && announcementId) {
        const { error: linkError } = await client.from('announcement_drive_links').insert({ announcement_id: announcementId, name: driveName, url: parsedDriveUrl.toString() });
        if (linkError) throw linkError;
      }
      for (const file of announcementFiles) {
        const extension = ANNOUNCEMENT_FILE_EXTENSIONS[file.type];
        const storagePath = `${userId}/${announcementId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await client.storage.from('announcement-attachments').upload(storagePath, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        const { error: metadataError } = await client.from('announcement_attachments').insert({
          announcement_id: announcementId, storage_path: storagePath, file_name: file.name, content_type: file.type, file_size: file.size,
        });
        if (metadataError) throw metadataError;
      }
      setAnnouncementForm({ ...emptyAnnouncementForm, areaId: areaId ?? '' });
      setAnnouncementFiles([]);
      setAnnouncementFormOpen(false);
      setFeedback('Comunicado publicado. O autor é identificado automaticamente pela sua conta.');
      void notifyWorkspacePush(client, 'announcement_created', announcementId!).then((result) => {
        if (result === 'failed') {
          setFeedback('Comunicado publicado, mas o push não foi enviado. O comunicado continua publicado.');
        }
      });
      await loadContent(false);
    } catch (saveError) {
      if (announcementId) {
        setFeedback('O comunicado foi publicado, mas algum link ou anexo não pôde ser concluído. Confira o acesso e tente novamente.');
        await loadContent(false);
      }
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function openAnnouncementAttachment(file: AnnouncementAttachment) {
    const cached = signedAttachmentUrls[file.id];
    if (cached) return;
    setInteractionBusy(`file:${file.id}`);
    try {
      const { data, error: signedError } = await client.storage.from('announcement-attachments').createSignedUrl(file.storage_path, 60);
      if (signedError) throw signedError;
      setSignedAttachmentUrls((current) => ({ ...current, [file.id]: data.signedUrl }));
    } catch (openError) {
      setInteractionError(errorMessage(openError));
    } finally {
      setInteractionBusy(null);
    }
  }

  async function removeAnnouncementAttachment(file: AnnouncementAttachment) {
    setInteractionBusy(`file-remove:${file.id}`);
    setInteractionError('');
    try {
      const { error: storageError } = await client.storage.from('announcement-attachments').remove([file.storage_path]);
      if (storageError) throw storageError;
      const { error: metadataError } = await client.rpc('remove_announcement_attachment', { p_attachment_id: file.id });
      if (metadataError) throw metadataError;
      await loadAnnouncementExtras(announcementIds ? announcementIds.split(',') : []);
    } catch (removeError) {
      setInteractionError(errorMessage(removeError));
    } finally {
      setInteractionBusy(null);
    }
  }

  async function removeAnnouncementDriveLink(link: AnnouncementDriveLink) {
    setInteractionBusy(`link-remove:${link.id}`);
    setInteractionError('');
    try {
      const { error: linkError } = await client.from('announcement_drive_links').delete().eq('id', link.id);
      if (linkError) throw linkError;
      await loadAnnouncementExtras(announcementIds ? announcementIds.split(',') : []);
    } catch (removeError) {
      setInteractionError(errorMessage(removeError));
    } finally {
      setInteractionBusy(null);
    }
  }

  async function voteInPoll(poll: AnnouncementPoll) {
    const selected = pollSelections[poll.announcement_id] ?? poll.my_option_ids;
    if (!selected.length) return;
    setInteractionBusy(`poll-vote:${poll.id}`);
    setInteractionError('');
    try {
      const { error: voteError } = await client.rpc('vote_announcement_poll', { p_poll_id: poll.id, p_option_ids: selected });
      if (voteError) throw voteError;
      await loadAnnouncementExtras(announcementIds ? announcementIds.split(',') : []);
    } catch (voteError) {
      setInteractionError(errorMessage(voteError));
    } finally {
      setInteractionBusy(null);
    }
  }

  async function closePoll(poll: AnnouncementPoll) {
    setInteractionBusy(`poll-close:${poll.id}`);
    setInteractionError('');
    try {
      const { error: closeError } = await client.rpc('close_announcement_poll', { p_poll_id: poll.id });
      if (closeError) throw closeError;
      await loadAnnouncementExtras(announcementIds ? announcementIds.split(',') : []);
    } catch (closeError) {
      setInteractionError(errorMessage(closeError));
    } finally {
      setInteractionBusy(null);
    }
  }

  async function togglePin(item: Announcement) {
    setSaving(true);
    setError('');
    setFeedback('');
    const { error: updateError } = await client
      .from('announcements')
      .update({ pinned_at: item.pinned_at ? null : new Date().toISOString() })
      .eq('id', item.id)
      .is('removed_at', null);
    if (updateError) setError(errorMessage(updateError));
    else {
      setFeedback(item.pinned_at ? 'Comunicado desafixado.' : 'Comunicado fixado no topo.');
      await loadContent(false);
    }
    setSaving(false);
  }

  async function removeAnnouncement(item: Announcement) {
    setSaving(true);
    setError('');
    setFeedback('');
    const { error: rpcError } = await client.rpc('remove_announcement', { p_announcement_id: item.id });
    if (rpcError) setError(errorMessage(rpcError));
    else {
      setConfirmAnnouncementId(null);
      setFeedback('Comunicado removido da lista. A alteração fica registrada no histórico.');
      await loadContent(false);
    }
    setSaving(false);
  }

  async function submitAnnouncementReply(event: FormEvent<HTMLFormElement>, announcementId: string) {
    event.preventDefault();
    const body = (replyDrafts[announcementId] ?? '').trim();
    if (!body) return;
    if (Array.from(body).length > 2000) {
      setInteractionError('A resposta pode ter até 2.000 caracteres.');
      return;
    }
    setInteractionBusy(`reply:${announcementId}`);
    setInteractionError('');
    try {
      const { error: insertError } = await client.from('announcement_replies').insert({ announcement_id: announcementId, body });
      if (insertError) throw insertError;
      setReplyDrafts((current) => ({ ...current, [announcementId]: '' }));
      await loadInteractions(announcementIds ? announcementIds.split(',') : []);
    } catch (replyError) {
      setInteractionError(errorMessage(replyError));
    } finally {
      setInteractionBusy(null);
    }
  }

  async function toggleAnnouncementReaction(announcementId: string, emoji: string) {
    const currentReaction = announcementReactions.find((reaction) =>
      reaction.announcement_id === announcementId && reaction.user_id === userId && reaction.emoji === emoji);
    const busyKey = `reaction:${announcementId}:${emoji}`;
    setInteractionBusy(busyKey);
    setInteractionError('');
    try {
      const result = currentReaction
        ? await client.from('announcement_reactions').delete().eq('id', currentReaction.id).eq('user_id', userId)
        : await client.from('announcement_reactions').insert({ announcement_id: announcementId, emoji });
      if (result.error) throw result.error;
      await loadInteractions(announcementIds ? announcementIds.split(',') : []);
    } catch (reactionError) {
      setInteractionError(errorMessage(reactionError));
    } finally {
      setInteractionBusy(null);
    }
  }

  async function removeAnnouncementReply(reply: AnnouncementReply) {
    setInteractionBusy(`remove:${reply.id}`);
    setInteractionError('');
    try {
      const { error: removeError } = await client.rpc('remove_announcement_reply', { p_reply_id: reply.id });
      if (removeError) throw removeError;
      await loadInteractions(announcementIds ? announcementIds.split(',') : []);
    } catch (removeError) {
      setInteractionError(errorMessage(removeError));
    } finally {
      setInteractionBusy(null);
    }
  }

  function formatReplyTime(value: string): string {
    return new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  const isFiles = mode === 'files';
  const channelScopeUnavailable = !isGeneralChannel && !areaId;
  const primaryFolder = folders.find((folder) => folder.is_primary);
  const folderCount = visibleFolders.length;
  const announcementCount = visibleAnnouncements.length;

  return (
    <section className="shared-content" aria-labelledby="shared-content-title">
      <div className="shared-content-heading">
        <div>
          <p className="workspace-kicker">{isFiles ? 'ATALHOS COMPARTILHADOS' : 'MURAL DA EQUIPE'}</p>
          <h2 id="shared-content-title">{isFiles ? 'Pastas e arquivos.' : 'Comunicados.'}</h2>
          <p>{isFiles
            ? 'Pastas visíveis para os integrantes deste canal; o conteúdo continua no Google Drive.'
            : 'Avisos compartilhados com todos os integrantes deste canal.'}</p>
        </div>
        <div className="shared-content-actions">
          <button className="workspace-refresh" type="button" onClick={() => {
            void loadContent(false);
            if (mode === 'announcements') void loadInteractions(announcementIds ? announcementIds.split(',') : []).catch((loadError) => setInteractionError(errorMessage(loadError)));
            if (mode === 'announcements') void loadAnnouncementExtras(announcementIds ? announcementIds.split(',') : []).catch((loadError) => setInteractionError(errorMessage(loadError)));
          }} disabled={loading || refreshing}>
            <RefreshCw size={14} aria-hidden="true" />{refreshing ? 'Atualizando…' : 'Atualizar'}
          </button>
          {!channelScopeUnavailable && (isFiles ? (
            <button className="workspace-add-button" type="button" onClick={() => {
              if (folderFormOpen) {
                setFolderFormOpen(false);
                setEditingFolderId(null);
                setFolderForm({ ...emptyFolderForm, areaId: areaId ?? '' });
              } else {
                setEditingFolderId(null);
                setFolderForm({ ...emptyFolderForm, areaId: areaId ?? '' });
                setFolderFormOpen(true);
              }
              setError('');
            }}>
              <Plus size={15} aria-hidden="true" /> Adicionar pasta
            </button>
          ) : (
            <button className="workspace-add-button" type="button" onClick={() => { setAnnouncementFormOpen((open) => !open); setError(''); }}>
              <Plus size={15} aria-hidden="true" /> Novo comunicado
            </button>
          ))}
        </div>
      </div>

      {channelScopeUnavailable && <p className="shared-content-note">Este canal ainda não está vinculado a uma área. Para evitar misturar dados globais com conteúdo privado, arquivos e comunicados ficam indisponíveis até que o canal seja associado a uma área.</p>}
      {error && <div className="workspace-alert workspace-alert-error" role="alert"><strong>Não foi possível concluir.</strong><p>{error}</p></div>}
      {feedback && <p className="workspace-feedback" role="status">{feedback}</p>}

      {isFiles && folderFormOpen && (
        <form className="shared-content-form" aria-labelledby="folder-form-title" onSubmit={(event) => void saveFolder(event)}>
          <div className="shared-content-form-heading"><div><strong id="folder-form-title">{editingFolderId ? 'Editar pasta compartilhada' : 'Adicionar pasta à equipe'}</strong><p>{editingFolderId ? 'Atualize o nome, o link, a área e a descrição da pasta.' : 'Informe o endereço compartilhável da pasta no Google Drive.'}</p></div><button type="button" className="shared-close" aria-label="Fechar formulário de pasta" onClick={() => { setFolderFormOpen(false); setEditingFolderId(null); setFolderForm(emptyFolderForm); }} disabled={saving}><X size={17} aria-hidden="true" /></button></div>
          <label><span>Nome da pasta <b>obrigatório</b></span><input required maxLength={120} value={folderForm.name} onChange={(event) => setFolderForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Documentos de Engenharia" /></label>
          <label><span>Link de redirecionamento do Google Drive <b>obrigatório</b></span><input required type="url" value={folderForm.driveUrl} onChange={(event) => setFolderForm((current) => ({ ...current, driveUrl: event.target.value }))} placeholder="https://drive.google.com/drive/folders/…" /></label>
          
          {editingFolderId && <label><span>Descrição <small>(opcional; até 500 caracteres)</small></span><textarea id="folder-description" rows={3} maxLength={500} aria-describedby="folder-description-count" value={folderForm.description} onChange={(event) => setFolderForm((current) => ({ ...current, description: event.target.value }))} placeholder="Contexto ou conteúdo desta pasta" /><small id="folder-description-count" className="shared-content-note">{folderForm.description.length}/500 caracteres</small></label>}
          <p className="shared-content-note">A pessoa que abrir precisa ter permissão própria no Drive. O SolMar não lê os arquivos da pasta.</p>
          <div className="shared-content-form-actions"><button className="workspace-cancel-button" type="button" onClick={() => { setFolderFormOpen(false); setEditingFolderId(null); setFolderForm(emptyFolderForm); }} disabled={saving}>Cancelar</button><button className="workspace-save-button" type="submit" disabled={saving}>{saving ? 'Salvando…' : editingFolderId ? 'Salvar alterações' : 'Adicionar pasta'}</button></div>
        </form>
      )}

      {mode === 'announcements' && announcementFormOpen && (
        <form className="shared-content-form" onSubmit={(event) => void saveAnnouncement(event)}>
          <div className="shared-content-form-heading"><div><strong>Publicar comunicado</strong><p>Seu nome será registrado automaticamente como autor.</p></div><button type="button" className="shared-close" aria-label="Fechar formulário" onClick={() => setAnnouncementFormOpen(false)}><X size={17} /></button></div>
          <label><span>Título <b>obrigatório</b></span><input required maxLength={180} value={announcementForm.title} onChange={(event) => setAnnouncementForm((current) => ({ ...current, title: event.target.value }))} placeholder="Um título claro para o aviso" /></label>
          <label><span>Mensagem <b>obrigatória</b></span><textarea required rows={5} maxLength={8000} value={announcementForm.message} onChange={(event) => setAnnouncementForm((current) => ({ ...current, message: event.target.value }))} placeholder="Escreva as informações para a equipe…" /></label>
          
          <div className="shared-announcement-create-extra">
            <strong><Link2 size={15} aria-hidden="true" /> Link compartilhável do Google Drive (opcional)</strong>
            <label><span>Nome do link</span><input maxLength={180} value={announcementForm.driveName} onChange={(event) => setAnnouncementForm((current) => ({ ...current, driveName: event.target.value }))} placeholder="Ex.: Ata da reunião" /></label>
            <label><span>URL (HTTPS)</span><input type="url" value={announcementForm.driveUrl} onChange={(event) => setAnnouncementForm((current) => ({ ...current, driveUrl: event.target.value }))} placeholder="https://drive.google.com/… ou https://docs.google.com/…" /></label>
            <p className="shared-content-note">O link apenas abre o Drive em outra aba. O SolMar não baixa nem sincroniza arquivos, e não altera permissões de compartilhamento.</p>
          </div>
          <label><span>Anexar arquivos do dispositivo</span><input type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,application/pdf,text/plain,text/csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={(event) => setAnnouncementFiles(Array.from(event.currentTarget.files ?? []))} /></label>
          {announcementFiles.length > 0 && <p className="shared-content-note">{announcementFiles.map((file) => `${file.name} (${formatFileSize(file.size)})`).join(' · ')} — limite de 15 MiB por arquivo.</p>}
          <fieldset className="shared-poll-create">
            <label className="shared-poll-enable"><input type="checkbox" checked={announcementForm.pollEnabled} onChange={(event) => setAnnouncementForm((current) => ({ ...current, pollEnabled: event.target.checked }))} /><span>Criar enquete junto com o comunicado</span></label>
            {announcementForm.pollEnabled && <>
              <label><span>Pergunta <b>obrigatória</b></span><input required maxLength={500} value={announcementForm.question} onChange={(event) => setAnnouncementForm((current) => ({ ...current, question: event.target.value }))} placeholder="O que precisamos decidir?" /></label>
              <div className="shared-poll-option-editor"><span>Opções <b>2 a 8</b></span>{announcementForm.options.map((option, index) => <div key={index} className="shared-poll-option-row"><input aria-label={`Opção ${index + 1}`} required maxLength={240} value={option} onChange={(event) => setAnnouncementForm((current) => ({ ...current, options: current.options.map((value, optionIndex) => optionIndex === index ? event.target.value : value) }))} placeholder={`Opção ${index + 1}`} />{announcementForm.options.length > 2 && <button type="button" className="shared-close" aria-label={`Remover opção ${index + 1}`} onClick={() => setAnnouncementForm((current) => ({ ...current, options: current.options.filter((_, optionIndex) => optionIndex !== index) }))}><X size={15} /></button>}</div>)}{announcementForm.options.length < 8 && <button type="button" className="shared-poll-add-option" onClick={() => setAnnouncementForm((current) => ({ ...current, options: [...current.options, ''] }))}><Plus size={13} aria-hidden="true" /> Adicionar opção</button>}</div>
              <label className="shared-poll-enable"><input type="checkbox" checked={announcementForm.allowMultiple} onChange={(event) => setAnnouncementForm((current) => ({ ...current, allowMultiple: event.target.checked }))} /><span>Permitir escolher mais de uma opção <small>(desmarcado: voto único)</small></span></label>
            </>}
          </fieldset>
          <div className="shared-content-form-actions"><button className="workspace-cancel-button" type="button" onClick={() => setAnnouncementFormOpen(false)} disabled={saving}>Cancelar</button><button className="workspace-save-button" type="submit" disabled={saving}>{saving ? 'Publicando…' : 'Publicar comunicado'}</button></div>
        </form>
      )}

      {isFiles ? (
        <>
          {primaryFolder && !normalizedQuery && (
            <a className="shared-primary-folder" href={primaryFolder.drive_url} target="_blank" rel="noreferrer" aria-label={`Abrir pasta principal ${primaryFolder.name} no Google Drive`}>
              <span className="shared-primary-icon"><FolderOpen size={29} aria-hidden="true" /></span>
              <span className="shared-primary-copy"><small>PASTA PRINCIPAL</small><strong>{primaryFolder.name}</strong><span>{areasById.get(primaryFolder.area_id ?? '') ?? 'Geral'} · abrir no Google Drive</span></span>
              <ArrowUpRight size={18} aria-hidden="true" />
            </a>
          )}
          <label className="shared-content-search"><span>Buscar pasta</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, descrição ou área" /></label>
          {loading ? <div className="workspace-loading" role="status"><span />Carregando pastas…</div> : folderCount === 0 ? (
            <div className="workspace-empty"><FolderOpen size={25} aria-hidden="true" /><strong>{folders.length ? 'Nenhuma pasta corresponde à busca.' : 'Ainda não há pastas compartilhadas.'}</strong><p>{folders.length ? 'Tente outra busca.' : 'Adicione um link do Google Drive para deixá-lo visível para a equipe.'}</p></div>
          ) : (
            <div className="shared-folder-grid">
              {visibleFolders.map((folder) => (
                <article className={`shared-folder-card${folder.is_primary ? ' is-primary' : ''}`} key={folder.id}>
                  <a href={folder.drive_url} target="_blank" rel="noreferrer" className="shared-folder-open" aria-label={`Abrir pasta ${folder.name} no Google Drive`}>
                    <span className="shared-folder-icon"><FolderOpen size={25} aria-hidden="true" /></span>
                    <span className="shared-folder-name">{folder.name}</span>
                    <span className="shared-folder-area">{areasById.get(folder.area_id ?? '') ?? 'Geral'}{folder.is_primary ? ' · Principal' : ''}</span>
                    {folder.description && <span className="shared-folder-description">{folder.description}</span>}
                    <ArrowUpRight className="shared-folder-external" size={16} aria-hidden="true" />
                  </a>
                  <div className="shared-card-actions">
                    <button type="button" onClick={() => editFolder(folder)} aria-label={`Editar pasta ${folder.name}`}><FileText size={13} aria-hidden="true" />Editar</button>
                    {!folder.is_primary && <button type="button" onClick={() => void setPrimary(folder)} disabled={saving || pendingPrimaryId !== null}><Pin size={13} aria-hidden="true" />{pendingPrimaryId === folder.id ? 'Atualizando…' : 'Tornar principal'}</button>}
                    {confirmFolderId === folder.id ? <div className="shared-confirm-actions"><span>Remover da lista?</span><button type="button" className="is-danger" onClick={() => void removeFolder(folder)} disabled={saving}><Check size={13} aria-hidden="true" />Confirmar</button><button type="button" onClick={() => setConfirmFolderId(null)} disabled={saving}><X size={13} aria-hidden="true" />Cancelar</button></div> : <button type="button" className="is-danger" onClick={() => setConfirmFolderId(folder.id)}><Trash2 size={13} aria-hidden="true" />Remover</button>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <label className="shared-content-search"><span>Buscar comunicado</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Título, mensagem ou área" /></label>
          {interactionError && <p className="shared-interaction-alert" role="alert">{interactionError}</p>}
          {loading ? <div className="workspace-loading" role="status"><span />Carregando comunicados…</div> : announcementCount === 0 ? (
            <div className="workspace-empty"><Megaphone size={25} aria-hidden="true" /><strong>{announcements.length ? 'Nenhum comunicado corresponde à busca.' : 'Ainda não há comunicados.'}</strong><p>{announcements.length ? 'Tente outra busca.' : 'Publique um aviso para compartilhar informações com a equipe.'}</p></div>
          ) : (
            <div className="shared-announcement-list">
              {visibleAnnouncements.map((item) => (
                <article id={`announcement-card-${item.id}`} className={`shared-announcement-card${item.pinned_at ? ' is-pinned' : ''}${targetAnnouncementId === item.id ? ' is-push-target' : ''}`} key={item.id}>
                  <div className="shared-announcement-meta"><span className="shared-audience">{item.audience_area_id ? areasById.get(item.audience_area_id) ?? 'Área' : 'Toda a equipe'}</span><span>{formatDate(item.created_at)}</span>{item.pinned_at && <span className="shared-pinned-label"><Pin size={12} aria-hidden="true" />Fixado</span>}</div>
                  <h3>{item.title}</h3>
                  <p className="shared-announcement-message">{item.message}</p>
                  {(announcementAttachments.some((file) => file.announcement_id === item.id) || announcementDriveLinks.some((link) => link.announcement_id === item.id)) && (
                    <div className="shared-announcement-files" aria-label="Arquivos e links do comunicado">
                      {announcementAttachments.filter((file) => file.announcement_id === item.id).map((file) => {
                        const canManage = isAdmin || item.author_id === userId;
                        const signedUrl = signedAttachmentUrls[file.id];
                        return <div className="shared-announcement-file" key={file.id}>
                          <FileText size={15} aria-hidden="true" /><span><strong>{file.file_name}</strong><small>{formatFileSize(Number(file.file_size))}</small></span>
                          {signedUrl ? <a href={signedUrl} target="_blank" rel="noopener noreferrer">Abrir arquivo</a> : <button type="button" onClick={() => void openAnnouncementAttachment(file)} disabled={interactionBusy !== null}>{interactionBusy === `file:${file.id}` ? 'Preparando…' : 'Gerar link seguro'}</button>}
                          {canManage && <button type="button" className="is-danger" onClick={() => void removeAnnouncementAttachment(file)} disabled={interactionBusy !== null} aria-label={`Remover anexo ${file.file_name}`}><Trash2 size={13} aria-hidden="true" />Remover</button>}
                        </div>;
                      })}
                      {announcementDriveLinks.filter((link) => link.announcement_id === item.id).map((link) => (
                        <div className="shared-announcement-file" key={link.id}>
                          <Link2 size={15} aria-hidden="true" /><span><strong>{link.name}</strong><small>Link externo do Google Drive</small></span>
                          <a href={link.url} target="_blank" rel="noopener noreferrer">Abrir link</a>
                          {(isAdmin || item.author_id === userId) && <button type="button" className="is-danger" onClick={() => void removeAnnouncementDriveLink(link)} disabled={interactionBusy !== null} aria-label={`Remover link ${link.name}`}><Trash2 size={13} aria-hidden="true" />Remover</button>}
                        </div>
                      ))}
                    </div>
                  )}
                  {announcementPolls[item.id] && (() => {
                    const poll = announcementPolls[item.id];
                    const selected = pollSelections[item.id] ?? poll.my_option_ids;
                    const totalVotes = poll.options.reduce((sum, option) => sum + option.votes, 0);
                    const canClose = isAdmin || item.author_id === userId;
                    return <section className={`shared-announcement-poll${poll.closed_at ? ' is-closed' : ''}`} aria-label={`Enquete: ${poll.question}`}>
                      <div className="shared-poll-heading"><div><span>ENQUETE</span><h4>{poll.question}</h4></div><span className="shared-poll-status">{poll.closed_at ? 'Encerrada' : 'Aberta'}</span></div>
                      <div className="shared-poll-options">
                        {poll.options.map((option) => {
                          const checked = selected.includes(option.id);
                          const percentage = totalVotes ? Math.round(option.votes / totalVotes * 100) : 0;
                          return <label className={`shared-poll-option${checked ? ' is-selected' : ''}`} key={option.id}>
                            <input type={poll.allow_multiple ? 'checkbox' : 'radio'} name={`poll-${poll.id}`} checked={checked} disabled={Boolean(poll.closed_at) || interactionBusy !== null} onChange={(event) => {
                              setPollSelections((current) => {
                                const currentSelected = current[item.id] ?? poll.my_option_ids;
                                const next = poll.allow_multiple
                                  ? event.target.checked ? [...currentSelected, option.id] : currentSelected.filter((id) => id !== option.id)
                                  : [option.id];
                                return { ...current, [item.id]: next };
                              });
                            }} />
                            <span className="shared-poll-option-copy"><strong>{option.label}</strong><span className="shared-poll-result-track"><span style={{ width: `${percentage}%` }} /></span></span>
                            <small>{option.votes} · {percentage}%</small>
                          </label>;
                        })}
                      </div>
                      <div className="shared-poll-footer"><span>{totalVotes} {totalVotes === 1 ? 'voto' : 'votos'} · {poll.allow_multiple ? 'múltipla escolha' : 'voto único'}{selected.length ? ' · você votou' : ''}</span>
                        {!poll.closed_at && <button type="button" onClick={() => void voteInPoll(poll)} disabled={interactionBusy !== null || selected.length === 0}>{interactionBusy === `poll-vote:${poll.id}` ? 'Registrando…' : selected.length ? 'Registrar / trocar voto' : 'Escolha uma opção'}</button>}
                        {!poll.closed_at && canClose && <button type="button" className="is-danger" onClick={() => void closePoll(poll)} disabled={interactionBusy !== null}>{interactionBusy === `poll-close:${poll.id}` ? 'Encerrando…' : 'Encerrar enquete'}</button>}
                      </div>
                      {poll.closed_at && <p className="shared-content-note">Enquete encerrada em {new Date(poll.closed_at).toLocaleString('pt-BR')}.</p>}
                    </section>;
                  })()}
                  <div className="shared-announcement-footer"><span>Publicado por <strong>{membersById.get(item.author_id ?? '') || 'Integrante ativo'}</strong></span><div className="shared-card-actions">
                    <button type="button" onClick={() => void togglePin(item)} disabled={saving}>{item.pinned_at ? <PinOff size={13} aria-hidden="true" /> : <Pin size={13} aria-hidden="true" />}{item.pinned_at ? 'Desafixar' : 'Fixar'}</button>
                    {confirmAnnouncementId === item.id ? <div className="shared-confirm-actions"><span>Remover comunicado?</span><button type="button" className="is-danger" onClick={() => void removeAnnouncement(item)} disabled={saving}><Check size={13} aria-hidden="true" />Confirmar</button><button type="button" onClick={() => setConfirmAnnouncementId(null)} disabled={saving}><X size={13} aria-hidden="true" />Cancelar</button></div> : <button type="button" className="is-danger" onClick={() => setConfirmAnnouncementId(item.id)}><Trash2 size={13} aria-hidden="true" />Remover</button>}
                  </div></div>
                  <section className="shared-announcement-interactions" aria-label={`Respostas e reações para ${item.title}`}>
                    <div className="shared-announcement-reactions" aria-label="Reações">
                      {ANNOUNCEMENT_REACTIONS.map((emoji) => {
                        const matching = announcementReactions.filter((reaction) => reaction.announcement_id === item.id && reaction.emoji === emoji);
                        const ownReaction = matching.find((reaction) => reaction.user_id === userId);
                        return (
                          <button
                            type="button"
                            key={emoji}
                            className={ownReaction ? 'is-selected' : ''}
                            aria-pressed={Boolean(ownReaction)}
                            aria-label={`${ownReaction ? 'Remover' : 'Adicionar'} reação ${emoji}; ${matching.length} reações`}
                            onClick={() => void toggleAnnouncementReaction(item.id, emoji)}
                            disabled={Boolean(interactionError) || interactionsLoading || interactionBusy !== null || mode !== 'announcements'}
                          >
                            <span aria-hidden="true">{emoji}</span><span>{matching.length}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="shared-announcement-replies">
                      <h4>Respostas <span>{announcementReplies.filter((reply) => reply.announcement_id === item.id).length}</span></h4>
                      {announcementReplies.filter((reply) => reply.announcement_id === item.id).map((reply) => (
                        <article className="shared-announcement-reply" key={reply.id}>
                          <div className="shared-reply-meta">
                            <strong>{membersById.get(reply.author_id ?? '') || 'Integrante ativo'}</strong>
                            <time dateTime={reply.created_at}>{formatReplyTime(reply.created_at)}</time>
                            {(reply.author_id === userId || isAdmin) && (
                              <button type="button" onClick={() => void removeAnnouncementReply(reply)} disabled={interactionBusy !== null} aria-label={`Remover resposta de ${membersById.get(reply.author_id ?? '') || 'integrante'}`}>
                                <Trash2 size={13} aria-hidden="true" /> Remover
                              </button>
                            )}
                          </div>
                          <p>{reply.body}</p>
                        </article>
                      ))}
                      <form className="shared-announcement-reply-form" onSubmit={(event) => void submitAnnouncementReply(event, item.id)}>
                        <label className="sr-only" htmlFor={`announcement-reply-${item.id}`}>Escreva uma resposta</label>
                        <textarea
                          id={`announcement-reply-${item.id}`}
                          value={replyDrafts[item.id] ?? ''}
                          onChange={(event) => setReplyDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                          placeholder="Escreva uma resposta para a equipe…"
                          rows={2}
                          maxLength={2000}
                          disabled={Boolean(interactionError) || interactionsLoading || interactionBusy !== null}
                        />
                        <button type="submit" disabled={Boolean(interactionError) || interactionsLoading || interactionBusy !== null || !(replyDrafts[item.id] ?? '').trim()}>
                          {interactionBusy === `reply:${item.id}` ? 'Enviando…' : 'Responder'}
                        </button>
                      </form>
                    </div>
                  </section>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
