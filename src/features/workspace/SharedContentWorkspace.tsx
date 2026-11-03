import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowUpRight, Check, FolderOpen, Megaphone, Pin, PinOff, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import type { Area, MemberProfile } from './domain';
import { notifyWorkspacePush } from '../../lib/notifications';
import './shared-content.css';

type ContentMode = 'files' | 'announcements';
type SharedContentWorkspaceProps = {
  client: SupabaseClient;
  mode: ContentMode;
  areas: Pick<Area, 'id' | 'name'>[];
  members: Pick<MemberProfile, 'user_id' | 'full_name'>[];
};
type DriveFolder = {
  id: string;
  name: string;
  drive_url: string;
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
type FolderForm = { name: string; driveUrl: string; areaId: string };
type AnnouncementForm = { title: string; message: string; areaId: string };

const emptyFolderForm: FolderForm = { name: '', driveUrl: '', areaId: '' };
const emptyAnnouncementForm: AnnouncementForm = { title: '', message: '', areaId: '' };

function errorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return 'Ocorreu um erro inesperado. Confira a conexão e tente novamente.';
  const candidate = error as { message?: string; code?: string };
  const message = candidate.message ?? '';
  if (candidate.code === '42501' || /row-level security|permission denied/i.test(message)) {
    return 'O Supabase ainda está bloqueando essa ação. Confirme que a migração incremental da Etapa 5 foi aplicada no projeto certo; não desative o RLS.';
  }
  if (candidate.code === 'PGRST202' || /function .*remove_drive_folder.*not found/i.test(message)) {
    return 'A função segura de remoção ainda não existe neste banco. Aplique a migração incremental da Etapa 5 no Supabase.';
  }
  if (/drive_folders_single_primary|duplicate key/i.test(message)) {
    return 'Outra pessoa definiu uma pasta principal ao mesmo tempo. Atualize a lista e tente de novo.';
  }
  return message || 'Ocorreu um erro inesperado. Confira a conexão e tente novamente.';
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function SharedContentWorkspace({ client, mode, areas, members }: SharedContentWorkspaceProps) {
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [folderFormOpen, setFolderFormOpen] = useState(false);
  const [announcementFormOpen, setAnnouncementFormOpen] = useState(false);
  const [folderForm, setFolderForm] = useState<FolderForm>(emptyFolderForm);
  const [announcementForm, setAnnouncementForm] = useState<AnnouncementForm>(emptyAnnouncementForm);
  const [confirmFolderId, setConfirmFolderId] = useState<string | null>(null);
  const [confirmAnnouncementId, setConfirmAnnouncementId] = useState<string | null>(null);
  const [pendingPrimaryId, setPendingPrimaryId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const loadContent = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      if (mode === 'files') {
        const { data, error: queryError } = await client
          .from('drive_folders')
          .select('id,name,drive_url,area_id,is_primary,added_by,created_at')
          .is('removed_at', null)
          .order('is_primary', { ascending: false })
          .order('created_at', { ascending: true });
        if (queryError) throw queryError;
        setFolders((data ?? []) as DriveFolder[]);
      } else {
        const { data, error: queryError } = await client
          .from('announcements')
          .select('id,title,message,audience_area_id,author_id,pinned_at,created_at')
          .is('removed_at', null)
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
  }, [client, mode]);

  useEffect(() => {
    void loadContent(true);
  }, [loadContent]);

  const areasById = useMemo(() => new Map(areas.map((area) => [area.id, area.name])), [areas]);
  const membersById = useMemo(() => new Map(members.map((member) => [member.user_id, member.full_name])), [members]);
  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
  const visibleFolders = folders.filter((folder) => !normalizedQuery || `${folder.name} ${areasById.get(folder.area_id ?? '') ?? 'Geral'}`.toLocaleLowerCase('pt-BR').includes(normalizedQuery));
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

    setSaving(true);
    setError('');
    setFeedback('');
    try {
      const needsPrimary = !folders.some((folder) => folder.is_primary);
      const { error: insertError } = await client.from('drive_folders').insert({
        name,
        drive_url: parsedUrl.toString(),
        area_id: folderForm.areaId || null,
        is_primary: needsPrimary,
      });
      if (insertError) throw insertError;
      setFolderForm(emptyFolderForm);
      setFolderFormOpen(false);
      setFeedback('Pasta adicionada. O link abre em uma nova aba; o site não acessa o conteúdo do Drive.');
      await loadContent(false);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
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
    setSaving(true);
    setError('');
    setFeedback('');
    try {
      const { data, error: insertError } = await client.from('announcements').insert({
        title,
        message,
        audience_area_id: announcementForm.areaId || null,
      }).select('id').single();
      if (insertError) throw insertError;
      setAnnouncementForm(emptyAnnouncementForm);
      setAnnouncementFormOpen(false);
      setFeedback('Comunicado publicado. O autor é identificado automaticamente pela sua conta.');
      void notifyWorkspacePush(client, 'announcement_created', data.id).then((result) => {
        if (result === 'failed') {
          setFeedback('Comunicado publicado, mas o push não foi enviado. O comunicado continua publicado.');
        }
      });
      await loadContent(false);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
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
    const { error: updateError } = await client
      .from('announcements')
      .update({ removed_at: new Date().toISOString() })
      .eq('id', item.id)
      .is('removed_at', null);
    if (updateError) setError(errorMessage(updateError));
    else {
      setConfirmAnnouncementId(null);
      setFeedback('Comunicado removido da lista. A alteração fica registrada no histórico.');
      await loadContent(false);
    }
    setSaving(false);
  }

  const isFiles = mode === 'files';
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
            ? 'Pastas visíveis para a equipe; o conteúdo continua no Google Drive.'
            : 'Avisos para toda a equipe ou para uma área específica.'}</p>
        </div>
        <div className="shared-content-actions">
          <button className="workspace-refresh" type="button" onClick={() => void loadContent(false)} disabled={loading || refreshing}>
            <RefreshCw size={14} aria-hidden="true" />{refreshing ? 'Atualizando…' : 'Atualizar'}
          </button>
          {isFiles ? (
            <button className="workspace-add-button" type="button" onClick={() => { setFolderFormOpen((open) => !open); setError(''); }}>
              <Plus size={15} aria-hidden="true" /> Adicionar pasta
            </button>
          ) : (
            <button className="workspace-add-button" type="button" onClick={() => { setAnnouncementFormOpen((open) => !open); setError(''); }}>
              <Plus size={15} aria-hidden="true" /> Novo comunicado
            </button>
          )}
        </div>
      </div>

      {error && <div className="workspace-alert workspace-alert-error" role="alert"><strong>Não foi possível concluir.</strong><p>{error}</p></div>}
      {feedback && <p className="workspace-feedback" role="status">{feedback}</p>}

      {isFiles && folderFormOpen && (
        <form className="shared-content-form" onSubmit={(event) => void saveFolder(event)}>
          <div className="shared-content-form-heading"><div><strong>Adicionar pasta à equipe</strong><p>Informe o endereço compartilhável da pasta no Google Drive.</p></div><button type="button" className="shared-close" aria-label="Fechar formulário" onClick={() => setFolderFormOpen(false)}><X size={17} /></button></div>
          <label><span>Nome da pasta <b>obrigatório</b></span><input required maxLength={120} value={folderForm.name} onChange={(event) => setFolderForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Documentos de Engenharia" /></label>
          <label><span>Link de redirecionamento do Google Drive <b>obrigatório</b></span><input required type="url" value={folderForm.driveUrl} onChange={(event) => setFolderForm((current) => ({ ...current, driveUrl: event.target.value }))} placeholder="https://drive.google.com/drive/folders/…" /></label>
          <label><span>Área</span><select value={folderForm.areaId} onChange={(event) => setFolderForm((current) => ({ ...current, areaId: event.target.value }))}><option value="">Geral (toda a equipe)</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
          <p className="shared-content-note">A pessoa que abrir precisa ter permissão própria no Drive. O SolMar não lê os arquivos da pasta.</p>
          <div className="shared-content-form-actions"><button className="workspace-cancel-button" type="button" onClick={() => setFolderFormOpen(false)} disabled={saving}>Cancelar</button><button className="workspace-save-button" type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Adicionar pasta'}</button></div>
        </form>
      )}

      {mode === 'announcements' && announcementFormOpen && (
        <form className="shared-content-form" onSubmit={(event) => void saveAnnouncement(event)}>
          <div className="shared-content-form-heading"><div><strong>Publicar comunicado</strong><p>Seu nome será registrado automaticamente como autor.</p></div><button type="button" className="shared-close" aria-label="Fechar formulário" onClick={() => setAnnouncementFormOpen(false)}><X size={17} /></button></div>
          <label><span>Título <b>obrigatório</b></span><input required maxLength={180} value={announcementForm.title} onChange={(event) => setAnnouncementForm((current) => ({ ...current, title: event.target.value }))} placeholder="Um título claro para o aviso" /></label>
          <label><span>Mensagem <b>obrigatória</b></span><textarea required rows={5} maxLength={8000} value={announcementForm.message} onChange={(event) => setAnnouncementForm((current) => ({ ...current, message: event.target.value }))} placeholder="Escreva as informações para a equipe…" /></label>
          <label><span>Destinatário</span><select value={announcementForm.areaId} onChange={(event) => setAnnouncementForm((current) => ({ ...current, areaId: event.target.value }))}><option value="">Toda a equipe</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
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
          <label className="shared-content-search"><span>Buscar pasta</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome ou área" /></label>
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
                    <ArrowUpRight className="shared-folder-external" size={16} aria-hidden="true" />
                  </a>
                  <div className="shared-card-actions">
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
          {loading ? <div className="workspace-loading" role="status"><span />Carregando comunicados…</div> : announcementCount === 0 ? (
            <div className="workspace-empty"><Megaphone size={25} aria-hidden="true" /><strong>{announcements.length ? 'Nenhum comunicado corresponde à busca.' : 'Ainda não há comunicados.'}</strong><p>{announcements.length ? 'Tente outra busca.' : 'Publique um aviso para compartilhar informações com a equipe.'}</p></div>
          ) : (
            <div className="shared-announcement-list">
              {visibleAnnouncements.map((item) => (
                <article className={`shared-announcement-card${item.pinned_at ? ' is-pinned' : ''}`} key={item.id}>
                  <div className="shared-announcement-meta"><span className="shared-audience">{item.audience_area_id ? areasById.get(item.audience_area_id) ?? 'Área' : 'Toda a equipe'}</span><span>{formatDate(item.created_at)}</span>{item.pinned_at && <span className="shared-pinned-label"><Pin size={12} aria-hidden="true" />Fixado</span>}</div>
                  <h3>{item.title}</h3>
                  <p className="shared-announcement-message">{item.message}</p>
                  <div className="shared-announcement-footer"><span>Publicado por <strong>{membersById.get(item.author_id ?? '') || 'Integrante ativo'}</strong></span><div className="shared-card-actions">
                    <button type="button" onClick={() => void togglePin(item)} disabled={saving}>{item.pinned_at ? <PinOff size={13} aria-hidden="true" /> : <Pin size={13} aria-hidden="true" />}{item.pinned_at ? 'Desafixar' : 'Fixar'}</button>
                    {confirmAnnouncementId === item.id ? <div className="shared-confirm-actions"><span>Remover comunicado?</span><button type="button" className="is-danger" onClick={() => void removeAnnouncement(item)} disabled={saving}><Check size={13} aria-hidden="true" />Confirmar</button><button type="button" onClick={() => setConfirmAnnouncementId(null)} disabled={saving}><X size={13} aria-hidden="true" />Cancelar</button></div> : <button type="button" className="is-danger" onClick={() => setConfirmAnnouncementId(item.id)}><Trash2 size={13} aria-hidden="true" />Remover</button>}
                  </div></div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
