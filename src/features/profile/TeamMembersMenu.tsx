import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ChevronDown, LoaderCircle, MailPlus, RefreshCw, ShieldCheck, ShieldPlus, UserRound, Users, X } from 'lucide-react';
import './team-members-menu.css';

type TeamMembersMenuProps = {
  client: SupabaseClient;
  userId: string;
  isAdmin: boolean;
  onSelfProfileChanged: () => void | Promise<void>;
};

type TeamMember = {
  user_id: string;
  full_name: string | null;
  role: string | null;
  status: string | null;
  area_id: string | null;
};

const REFRESH_INTERVAL_MS = 45_000;

function displayName(name: string | null | undefined): string {
  return name?.trim() || 'Integrante sem nome';
}

function initialFrom(name: string): string {
  return Array.from(name.trim())[0]?.toLocaleUpperCase('pt-BR') ?? '?';
}

function roleLabel(role: string | null): string {
  if (role === 'admin') return 'Administrador';
  if (role === 'area_lead') return 'Líder de área';
  if (role === 'member') return 'Membro';
  return role || 'Função não definida';
}

function statusLabel(status: string | null): string {
  if (status === 'active') return 'Ativo';
  if (status === 'suspended') return 'Suspenso';
  return status || 'Status não definido';
}

async function invitationErrorMessage(error: unknown): Promise<string> {
  let code = '';
  if (error && typeof error === 'object') {
    const value = error as { context?: unknown; message?: unknown };
    if (typeof value.message === 'string') code = value.message;
    if (value.context && typeof value.context === 'object') {
      const context = value.context as {
        clone?: () => { json?: () => Promise<unknown> };
        json?: () => Promise<unknown>;
      };
      try {
        const response = typeof context.clone === 'function' ? context.clone() : context;
        if (typeof response.json === 'function') {
          const body = await response.json();
          if (body && typeof body === 'object') {
            if ('code' in body && typeof body.code === 'string') code = body.code;
            else if ('error' in body && typeof body.error === 'string') code = body.error;
            else if ('status' in body && typeof body.status === 'string') code = body.status;
          }
        }
      } catch {
        // Use the generic response below if the edge-function body is unavailable.
      }
    }
  }
  if (code.includes('email_already_registered')) {
    return 'Este email já está cadastrado na equipe.';
  }
  if (code.includes('email_rate_limited')) {
    return 'Muitos convites foram enviados recentemente. Aguarde antes de tentar novamente.';
  }
  return 'Não foi possível enviar o convite. Verifique os dados e tente novamente.';
}

export default function TeamMembersMenu({ client, userId, isAdmin, onSelfProfileChanged }: TeamMembersMenuProps) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState('');
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(() => new Set());
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const fetchPromiseRef = useRef<Promise<void> | null>(null);
  const signOutStartedRef = useRef(false);

  const loadMembers = useCallback(async (manual = false, force = false) => {
    if (fetchPromiseRef.current) {
      if (!force) return;
      await fetchPromiseRef.current;
    }
    if (manual) setRefreshing(true);
    const request = (async () => {
      try {
        const { data, error } = await client
          .from('profiles')
          .select('user_id,full_name,role,status,area_id')
          .order('full_name', { ascending: true });
        if (error) throw error;
        const roster = (data ?? []) as unknown as TeamMember[];
        setMembers(roster);
        setListError('');
        const ownProfile = roster.find((member) => member.user_id === userId);
        if (ownProfile && ownProfile.status !== 'active' && !signOutStartedRef.current) {
          signOutStartedRef.current = true;
          void client.auth.signOut().catch(() => undefined);
        }
        if (ownProfile?.status === 'active' && (ownProfile.role === 'admin') !== isAdmin) {
          void Promise.resolve(onSelfProfileChanged()).catch(() => undefined);
        }
      } catch {
        setListError('Não foi possível carregar a equipe. Verifique sua conexão e tente novamente.');
      } finally {
        setLoading(false);
        if (manual) setRefreshing(false);
      }
    })();
    fetchPromiseRef.current = request;
    await request;
    if (fetchPromiseRef.current === request) fetchPromiseRef.current = null;
  }, [client, isAdmin, onSelfProfileChanged, userId]);

  useEffect(() => {
    let mounted = true;
    const refresh = async (manual = false) => {
      if (!mounted) return;
      await loadMembers(manual);
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, REFRESH_INTERVAL_MS);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [loadMembers]);

  useEffect(() => {
    const channel = client.channel('team-presence', {
      config: { private: true, presence: { key: userId } },
    });
    const syncPresence = () => {
      if (cancelled) return;
      setOnlineUserIds(new Set(Object.keys(channel.presenceState())));
    };
    let cancelled = false;
    channel
      .on('presence', { event: 'sync' }, syncPresence)
      .on('presence', { event: 'join' }, syncPresence)
      .on('presence', { event: 'leave' }, syncPresence)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && !cancelled) {
          void channel.track({ user_id: userId, online_at: new Date().toISOString() });
          syncPresence();
        }
      });
    return () => {
      cancelled = true;
      void channel.untrack();
      void client.removeChannel(channel);
      setOnlineUserIds(new Set());
    };
  }, [client, userId]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const selfMember = members.find((member) => member.user_id === userId);
  const canManageMembers = isAdmin && selfMember?.status === 'active';

  async function updateMember(member: TeamMember, action: 'promote' | 'suspend') {
    if (!canManageMembers || member.user_id === userId || busyUserId) return;
    if (action === 'suspend') {
      const confirmed = window.confirm(
        'Remover da equipe? O acesso desta pessoa será suspenso, e o histórico dela será preservado.',
      );
      if (!confirmed) return;
    }
    setBusyUserId(member.user_id);
    setActionError('');
    setNotice('');
    try {
      const { error } = await client.rpc(
        action === 'promote' ? 'admin_promote_team_member' : 'admin_suspend_team_member',
        { p_user_id: member.user_id },
      );
      if (error) throw error;
      await loadMembers(false, true);
      setNotice(action === 'promote' ? 'Permissão de administrador atualizada.' : 'Acesso suspenso; o histórico foi preservado.');
    } catch {
      setActionError(action === 'promote'
        ? 'Não foi possível atualizar a função. Tente novamente ou fale com um administrador.'
        : 'Não foi possível suspender o acesso. Tente novamente ou fale com um administrador.');
    } finally {
      setBusyUserId(null);
    }
  }

  async function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin || inviting) return;
    const normalizedEmail = email.trim();
    const normalizedName = fullName.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setActionError('Informe um endereço de email válido.');
      setNotice('');
      return;
    }
    setInviting(true);
    setActionError('');
    setNotice('');
    try {
      const { error } = await client.functions.invoke('manage-team-members', {
        body: { action: 'invite', email: normalizedEmail, full_name: normalizedName },
      });
      if (error) throw error;
      setEmail('');
      setFullName('');
      await loadMembers(false, true);
      setNotice('Convite enviado. A lista da equipe foi atualizada.');
    } catch (error) {
      setActionError(await invitationErrorMessage(error));
    } finally {
      setInviting(false);
    }
  }

  return (
    <div className="team-members-menu" ref={rootRef}>
      <button
        className="team-members-trigger"
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="team-members-panel"
        aria-label={`${open ? 'Fechar' : 'Abrir'} menu de membros`}
        onClick={() => setOpen((value) => !value)}
      >
        <Users size={17} aria-hidden="true" />
        <span className="team-members-trigger-label">Membros</span>
        <ChevronDown className="team-members-trigger-chevron" size={14} aria-hidden="true" />
      </button>

      {open && (
        <section className="team-members-panel" id="team-members-panel" role="dialog" aria-label="Membros da equipe">
          <header className="team-members-heading">
            <div>
              <p className="team-members-kicker">TEAM CELERIS</p>
              <h2>Membros da equipe</h2>
            </div>
            <div className="team-members-heading-actions">
              <button
                className="team-members-icon-button"
                type="button"
                aria-label="Atualizar lista de membros"
                title="Atualizar"
              onClick={() => void loadMembers(true, true)}
                disabled={refreshing || loading}
              >
                {refreshing ? <LoaderCircle size={16} className="team-members-spinner" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
              </button>
              <button className="team-members-icon-button" type="button" aria-label="Fechar menu da equipe" onClick={() => setOpen(false)}>
                <X size={17} aria-hidden="true" />
              </button>
            </div>
          </header>

          {listError && <p className="team-members-error" role="alert">{listError}</p>}
          {loading ? (
            <p className="team-members-state" role="status"><LoaderCircle size={17} className="team-members-spinner" aria-hidden="true" /> Carregando membros…</p>
          ) : members.length === 0 ? (
            <p className="team-members-state"><UserRound size={18} aria-hidden="true" /> Nenhum membro visível no momento.</p>
          ) : (
            <ul className="team-members-list" aria-label="Lista de membros">
              {members.map((member) => {
                const name = displayName(member.full_name);
                const online = onlineUserIds.has(member.user_id);
                const canActOnMember = canManageMembers && member.user_id !== userId && member.status === 'active';
                return (
                  <li className="team-member-row" key={member.user_id}>
                    <span className="team-member-avatar" aria-hidden="true">{initialFrom(name)}</span>
                    <div className="team-member-details">
                      <span className="team-member-name">{name}</span>
                      <span className="team-member-meta">{roleLabel(member.role)} <span aria-hidden="true">·</span> {statusLabel(member.status)}</span>
                      <span className={`team-member-presence${online ? ' is-online' : ''}`}>
                        <span className="team-member-presence-dot" aria-hidden="true" />
                        {online ? 'Online' : 'Offline'}
                      </span>
                    </div>
                    {canActOnMember && (
                      <div className="team-member-actions" aria-label={`Ações para ${name}`}>
                        {member.role !== 'admin' && (
                          <button
                            className="team-member-action"
                            type="button"
                            title="Tornar administrador"
                            aria-label="Tornar administrador"
                            onClick={() => void updateMember(member, 'promote')}
                            disabled={busyUserId !== null}
                          >
                            {busyUserId === member.user_id ? <LoaderCircle size={15} className="team-members-spinner" aria-hidden="true" /> : <ShieldPlus size={15} aria-hidden="true" />}
                          </button>
                        )}
                        <button
                          className="team-member-action is-danger"
                          type="button"
                          title="Remover da equipe"
                          aria-label="Remover da equipe"
                          onClick={() => void updateMember(member, 'suspend')}
                          disabled={busyUserId !== null}
                        >
                          <ShieldCheck size={15} aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {isAdmin && (
            <form className="team-members-invite" onSubmit={(event) => void inviteMember(event)}>
              <div className="team-members-invite-title"><MailPlus size={16} aria-hidden="true" /><h3>Convidar pessoa</h3></div>
              <label className="team-members-field">
                Email
                <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nome@exemplo.com" required />
              </label>
              <label className="team-members-field">
                Nome <span>(opcional)</span>
                <input type="text" autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Nome da pessoa" maxLength={100} />
              </label>
              <button className="team-members-invite-button" type="submit" disabled={inviting}>
                {inviting ? <LoaderCircle size={15} className="team-members-spinner" aria-hidden="true" /> : <MailPlus size={15} aria-hidden="true" />}
                {inviting ? 'Enviando convite…' : 'Enviar convite'}
              </button>
            </form>
          )}

          {actionError && <p className="team-members-error" role="alert">{actionError}</p>}
          {notice && <p className="team-members-notice" role="status">{notice}</p>}
          <p className="team-members-footnote">A presença é temporária e não altera os dados do perfil.</p>
        </section>
      )}
    </div>
  );
}
