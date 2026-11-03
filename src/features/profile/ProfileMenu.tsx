import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  disableDesktopNotifications,
  enableDesktopNotifications,
  getDesktopNotificationStatus,
  type DesktopNotificationStatus,
} from '../../lib/desktopNotifications';
import './profile-menu.css';

const AVATAR_BUCKET = 'solmar-profile-photos';
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

type ProfileMenuProps = {
  client: SupabaseClient;
  userId: string;
  fallbackName: string;
  photoUrl: string | null;
  onUpdated: (value: { fullName: string; photoUrl: string | null }) => void;
};

type ProfileRecord = { full_name: string; avatar_path: string | null };

function messageFrom(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Não foi possível salvar o perfil. Verifique a conexão e tente novamente.';
}

function initialFrom(name: string): string {
  return Array.from(name.trim())[0]?.toLocaleUpperCase('pt-BR') ?? '?';
}

export default function ProfileMenu({ client, userId, fallbackName, photoUrl, onUpdated }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState(fallbackName);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(photoUrl);
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [schemaReady, setSchemaReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [desktopPushStatus, setDesktopPushStatus] = useState<DesktopNotificationStatus | null>(null);
  const [desktopPushBusy, setDesktopPushBusy] = useState(false);
  const [desktopPushMessage, setDesktopPushMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const photoUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const replacePhotoUrl = useCallback((nextUrl: string | null) => {
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    photoUrlRef.current = nextUrl?.startsWith('blob:') ? nextUrl : null;
    setAvatarUrl(nextUrl);
  }, []);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    const { data, error } = await client
      .from('profiles')
      .select('full_name,avatar_path')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      const fallback = await client
        .from('profiles')
        .select('full_name')
        .eq('user_id', userId)
        .maybeSingle();
      if (!fallback.error && fallback.data) setFullName(fallback.data.full_name || fallbackName);
      setSchemaReady(false);
      setNotice('As configurações de foto ainda dependem da nova migração do Supabase.');
      setLoading(false);
      return;
    }

    const current = data as ProfileRecord | null;
    setSchemaReady(Boolean(current));
    if (current) {
      const name = current.full_name || fallbackName;
      setFullName(name);
      setAvatarPath(current.avatar_path);
      onUpdated({ fullName: name, photoUrl: null });
      if (current.avatar_path) {
        const { data: photo, error: photoError } = await client.storage
          .from(AVATAR_BUCKET)
          .download(current.avatar_path);
        if (!photoError && photo) {
          const loadedPhotoUrl = URL.createObjectURL(photo);
          replacePhotoUrl(loadedPhotoUrl);
          onUpdated({ fullName: name, photoUrl: loadedPhotoUrl });
        } else {
          replacePhotoUrl(null);
          onUpdated({ fullName: name, photoUrl: null });
        }
      } else {
        replacePhotoUrl(null);
        onUpdated({ fullName: name, photoUrl: null });
      }
    }
    setLoading(false);
  }, [client, fallbackName, onUpdated, replacePhotoUrl, userId]);

  useEffect(() => {
    void loadProfile();
    return () => {
      if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    };
  }, [loadProfile]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    void getDesktopNotificationStatus().then((status) => {
      if (mounted) setDesktopPushStatus(status);
    });
    return () => { mounted = false; };
  }, [open]);

  async function changeDesktopNotifications(enable: boolean) {
    setDesktopPushBusy(true);
    setDesktopPushMessage('');
    try {
      const status = enable
        ? await enableDesktopNotifications(userId)
        : await disableDesktopNotifications();
      setDesktopPushStatus(status);
      if (status === 'enabled') setDesktopPushMessage('Notificações ativadas neste navegador.');
      else if (status === 'blocked') setDesktopPushMessage('A permissão está bloqueada nas configurações do navegador. Libere notificações para este site e tente novamente.');
      else if (status === 'permission_required') setDesktopPushMessage('O navegador não concluiu a permissão. Tente novamente pelo botão.');
      else if (status === 'disabled') setDesktopPushMessage('Notificações desativadas neste navegador.');
      else setDesktopPushMessage('Não foi possível ativar neste navegador. Verifique a conexão e tente novamente.');
    } catch {
      setDesktopPushMessage('Não foi possível configurar as notificações agora. Verifique sua conexão e tente novamente.');
    } finally {
      setDesktopPushBusy(false);
    }
  }

  function selectPhoto(file: File | undefined) {
    setErrorMessage('');
    setNotice('');
    if (!file) return;
    if (!(file.type in IMAGE_EXTENSIONS)) {
      setSelectedPhoto(null);
      setErrorMessage('Escolha uma imagem JPEG, PNG ou WebP.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setSelectedPhoto(null);
      setErrorMessage('A foto deve ter no máximo 2 MiB.');
      return;
    }
    setSelectedPhoto(file);
    setRemovePhoto(false);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = fullName.trim();
    if (normalizedName.length < 2 || normalizedName.length > 100) {
      setErrorMessage('O nome precisa ter de 2 a 100 caracteres.');
      return;
    }
    if (!schemaReady) {
      setErrorMessage('Aplique a migração incremental de perfil no Supabase antes de salvar.');
      return;
    }

    setSaving(true);
    setErrorMessage('');
    setNotice('');
    let uploadedPath: string | null = null;
    const oldPath = avatarPath;
    let oldPhotoRemovalFailed = false;
    try {
      let nextPath = avatarPath;
      if (selectedPhoto) {
        const extension = IMAGE_EXTENSIONS[selectedPhoto.type];
        uploadedPath = `${userId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await client.storage
          .from(AVATAR_BUCKET)
          .upload(uploadedPath, selectedPhoto, {
            contentType: selectedPhoto.type,
            cacheControl: '0',
            upsert: false,
          });
        if (uploadError) throw uploadError;
        nextPath = uploadedPath;
      } else if (removePhoto) {
        nextPath = null;
      }

      const { error: updateError } = await client
        .from('profiles')
        .update({ full_name: normalizedName, avatar_path: nextPath })
        .eq('user_id', userId);
      if (updateError) throw updateError;

      if ((selectedPhoto || removePhoto) && oldPath) {
        const { error: removalError } = await client.storage.from(AVATAR_BUCKET).remove([oldPath]);
        if (removalError) oldPhotoRemovalFailed = true;
      }

      let nextPhotoUrl: string | null = avatarUrl;
      if (selectedPhoto && uploadedPath) {
        nextPhotoUrl = URL.createObjectURL(selectedPhoto);
        replacePhotoUrl(nextPhotoUrl);
      } else if (removePhoto) {
        nextPhotoUrl = null;
        replacePhotoUrl(null);
      }
      setAvatarPath(nextPath);
      setSelectedPhoto(null);
      setRemovePhoto(false);
      onUpdated({ fullName: normalizedName, photoUrl: nextPhotoUrl });
      setNotice(oldPhotoRemovalFailed
        ? 'Perfil salvo. A foto antiga não pôde ser removida; avise o administrador.'
        : 'Configurações do perfil salvas.');
    } catch (error) {
      if (uploadedPath) {
        try {
          await client.storage.from(AVATAR_BUCKET).remove([uploadedPath]);
        } catch {
          // A falha de limpeza não deve ocultar o erro que impediu salvar o perfil.
        }
      }
      setErrorMessage(messageFrom(error));
    } finally {
      setSaving(false);
    }
  }

  const shownName = fullName.trim() || fallbackName || 'Integrante';
  const shownPhoto = avatarUrl;

  return (
    <div className="profile-menu">
      <button
        className="profile-menu-trigger"
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${open ? 'Fechar' : 'Abrir'} configurações de ${shownName}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="profile-avatar" aria-hidden="true">
          {shownPhoto ? <img src={shownPhoto} alt="" /> : <span>{initialFrom(shownName)}</span>}
        </span>
        <span className="profile-trigger-name">{shownName}</span>
        <span className="profile-trigger-chevron" aria-hidden="true">⌄</span>
      </button>

      {open && (
        <section className="profile-menu-popover" role="dialog" aria-label="Configurações de perfil">
          <div className="profile-menu-heading">
            <div>
              <p className="workspace-kicker">SUA CONTA</p>
              <h2>Configurações de perfil</h2>
            </div>
            <button className="profile-close" type="button" aria-label="Fechar configurações" onClick={() => setOpen(false)}>×</button>
          </div>

          <form onSubmit={(event) => void saveProfile(event)}>
            <section className="profile-notification-section" aria-labelledby="profile-notification-title">
              <div className="profile-notification-heading">
                <div><p className="workspace-kicker">NESTE COMPUTADOR</p><h3 id="profile-notification-title">Notificações do navegador</h3></div>
                {desktopPushStatus === 'enabled' && <span className="profile-push-on">Ativas</span>}
              </div>
              {desktopPushStatus === null && <p className="profile-notification-copy">Verificando suporte deste navegador…</p>}
              {desktopPushStatus === 'not_configured' && <p className="profile-notification-copy">O administrador ainda precisa concluir a configuração do Web Push no site.</p>}
              {desktopPushStatus === 'not_supported' && <p className="profile-notification-copy">Este navegador ou contexto não oferece suporte a notificações Web Push.</p>}
              {desktopPushStatus === 'app_webview' && <p className="profile-notification-copy">No aplicativo móvel, as notificações são controladas pelo sistema do aparelho.</p>}
              {desktopPushStatus === 'blocked' && <p className="profile-notification-copy">A permissão foi bloqueada pelo navegador. Altere a permissão do site nas configurações do navegador.</p>}
              {(desktopPushStatus === 'permission_required' || desktopPushStatus === 'disabled') && <p className="profile-notification-copy">Receba avisos do SolMar mesmo quando esta aba não estiver aberta, conforme as notificações configuradas para sua conta.</p>}
              {desktopPushStatus === 'enabled' && <p className="profile-notification-copy">Este navegador está inscrito para receber avisos do SolMar.</p>}
              {(desktopPushStatus === 'permission_required' || desktopPushStatus === 'disabled') && (
                <button type="button" className="profile-secondary-button profile-push-action" onClick={() => void changeDesktopNotifications(true)} disabled={desktopPushBusy}>
                  {desktopPushBusy ? 'Aguarde…' : 'Ativar neste navegador'}
                </button>
              )}
              {desktopPushStatus === 'enabled' && (
                <button type="button" className="profile-text-button profile-push-disable" onClick={() => void changeDesktopNotifications(false)} disabled={desktopPushBusy}>
                  {desktopPushBusy ? 'Aguarde…' : 'Desativar notificações'}
                </button>
              )}
              {desktopPushMessage && <p className="profile-notification-feedback" role="status">{desktopPushMessage}</p>}
            </section>

            <div className="profile-photo-row">
              <span className="profile-avatar profile-avatar-large" aria-hidden="true">
                {shownPhoto ? <img src={shownPhoto} alt="" /> : <span>{initialFrom(shownName)}</span>}
              </span>
              <div className="profile-photo-actions">
                <button type="button" className="profile-secondary-button" onClick={() => fileInputRef.current?.click()} disabled={loading || saving || !schemaReady}>
                  Escolher foto
                </button>
                {avatarPath && !removePhoto && <button type="button" className="profile-text-button" onClick={() => { setRemovePhoto(true); setSelectedPhoto(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} disabled={loading || saving}>Remover foto</button>}
                {removePhoto && <button type="button" className="profile-text-button" onClick={() => setRemovePhoto(false)} disabled={loading || saving}>Manter a foto</button>}
                <small>JPEG, PNG ou WebP · até 2 MiB</small>
                {selectedPhoto && <small>{selectedPhoto.name}</small>}
              </div>
              <input
                ref={fileInputRef}
                className="profile-file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => { selectPhoto(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }}
                aria-label="Escolher foto do perfil"
              />
            </div>

            <label className="profile-name-field">
              <span>Nome exibido</span>
              <input
                required
                minLength={2}
                maxLength={100}
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                disabled={loading || saving || !schemaReady}
              />
            </label>
            {!schemaReady && <p className="profile-hint">A migração incremental de perfil ainda precisa ser aplicada no Supabase.</p>}
            {notice && <p className="profile-notice" role="status">{notice}</p>}
            {errorMessage && <p className="profile-error" role="alert">{errorMessage}</p>}
            <div className="profile-menu-footer">
              <button type="button" className="profile-secondary-button" onClick={() => setOpen(false)}>Fechar</button>
              <button type="submit" className="profile-save-button" disabled={loading || saving || !schemaReady}>
                {saving ? 'Salvando…' : 'Salvar perfil'}
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
