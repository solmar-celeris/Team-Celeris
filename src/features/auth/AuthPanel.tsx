import { useEffect, useState, type FormEvent } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '../../lib/supabase';

type AuthMode = 'login' | 'signup' | 'reset' | 'update-password';
type MemberRole = 'admin' | 'area_lead' | 'member' | 'reader';
type MemberStatus = 'pending' | 'active' | 'suspended';
type MemberProfile = {
  full_name: string;
  role: MemberRole;
  status: MemberStatus;
  area_id: string | null;
};
type AccessState = MemberStatus | 'missing' | 'error' | null;

const roleLabels: Record<MemberRole, string> = {
  admin: 'Administrador',
  area_lead: 'Líder de área',
  member: 'Membro',
  reader: 'Leitor',
};

async function readMemberProfile(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from('profiles')
    .select('full_name, role, status, area_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as MemberProfile | null;
}

function getAuthError(input: string | { message?: string; code?: string; status?: number }) {
  const message = typeof input === 'string' ? input : input.message ?? '';
  const code = typeof input === 'string' ? '' : (input.code ?? '').toLowerCase();
  const status = typeof input === 'string' ? undefined : input.status;
  const text = message.toLowerCase();
  if (code === 'invalid_credentials' || text.includes('invalid login credentials')) {
    return 'E-mail ou senha incorretos. Confira os dados e tente novamente.';
  }
  if (code === 'email_not_confirmed' || text.includes('email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar. Confira a caixa de entrada e o spam.';
  }
  if (code.includes('rate_limit') || text.includes('too many requests') || text.includes('rate limit') || text.includes('429') || text.includes('for security purposes')) {
    return 'O limite de tentativas ou de e-mails foi atingido. Aguarde um pouco antes de tentar novamente.';
  }
  if (text.includes('signups not allowed') || text.includes('sign up is disabled')) {
    return 'O cadastro ainda está desativado no Supabase. Avise o administrador do projeto.';
  }
  if (code.includes('api_key') || text.includes('invalid api key') || text.includes('no api key found') || text.includes('api key not found') || text.includes('project not found')) {
    return 'A conexão do site com o Supabase foi rejeitada. Peça ao administrador para revisar a URL e a chave publishable configuradas na publicação.';
  }
  if (text.includes('redirect') || text.includes('allow list') || text.includes('allowlist')) {
    return 'O endereço de retorno não está autorizado no Supabase. Peça ao administrador para conferir a URL do site e a lista de redirecionamentos permitidos.';
  }
  if (text.includes('email provider') || text.includes('smtp') || text.includes('failed to send') || text.includes('not configured')) {
    return 'O Supabase não conseguiu enviar o e-mail. Peça ao administrador para conferir o provedor de e-mail nas configurações de Auth.';
  }
  if (text.includes('expired') || text.includes('invalid token') || text.includes('otp_expired')) {
    return 'Este link expirou ou já foi utilizado. Solicite um novo link de redefinição.';
  }
  if (text.includes('failed to fetch') || text.includes('networkerror') || text.includes('network request failed') || text.includes('fetch failed') || text.includes('load failed') || text.includes('timed out') || text.includes('timeout')) {
    return 'Não foi possível alcançar o serviço de login. Confira a conexão e tente novamente; se persistir, o administrador deve verificar o status do Supabase.';
  }
  if (text.includes('weak password') || text.includes('password should be at least')) {
    return 'A senha precisa ter pelo menos 8 caracteres.';
  }
  if (status && status >= 500) {
    return `O serviço de login respondeu com erro temporário (HTTP ${status}). O administrador deve conferir Authentication → Logs no Supabase.`;
  }
  const safeCode = code.replace(/[^a-z0-9_-]/g, '').slice(0, 40);
  const reference = status ? `AUTH-HTTP-${status}` : safeCode ? `AUTH-${safeCode}` : 'AUTH-UNCLASSIFIED';
  return `Falha não classificada ao autenticar (${reference}). O administrador deve conferir Authentication → Logs no Supabase.`;
}

export default function AuthPanel() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [accessState, setAccessState] = useState<AccessState>(null);
  const [booting, setBooting] = useState(Boolean(supabaseConfigured));
  const [profileLoading, setProfileLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [logoutError, setLogoutError] = useState('');

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const authError = window.location.search
      ? new URLSearchParams(window.location.search).get('error_description')
      : null;
    const linkError = authError ?? hashParams.get('error_description');
    if (linkError) {
      setMode('reset');
      setErrorMessage('O link não é mais válido. Solicite um novo link de redefinição.');
    }

    if (!supabase) {
      setBooting(false);
      return;
    }

    const client = supabase;
    let mounted = true;
    const { data: { subscription } } = client.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY') {
        setMode('update-password');
        setErrorMessage('');
        setNotice('');
      }
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null);
        setAccessState(null);
      }
    });

    void client.auth.getSession().then(async ({ data, error }) => {
      if (!mounted) return;
      if (error) {
        setBooting(false);
        return;
      }
      const currentSession = data.session;
      setSession(currentSession);
      if (currentSession) {
        setProfileLoading(true);
        try {
          const currentProfile = await readMemberProfile(client, currentSession.user.id);
          if (mounted) {
            setProfile(currentProfile);
            setAccessState(currentProfile?.status ?? 'missing');
          }
        } catch {
          if (mounted) setAccessState('error');
        } finally {
          if (mounted) setProfileLoading(false);
        }
      }
      if (mounted) setBooting(false);
    }).catch(() => {
      if (mounted) setBooting(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setErrorMessage('');
    setNotice('');
    setPassword('');
    setConfirmPassword('');
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setErrorMessage('Conexão com o serviço de acesso não configurada. Avise o administrador.');
      return;
    }
    setSubmitting(true);
    setErrorMessage('');
    setNotice('');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setErrorMessage(getAuthError(error));
        return;
      }
      setSession(data.session);
      setPassword('');
      setProfileLoading(true);
      try {
        const currentProfile = await readMemberProfile(supabase, data.user.id);
        setProfile(currentProfile);
        setAccessState(currentProfile?.status ?? 'missing');
      } catch {
        setProfile(null);
        setAccessState('error');
      } finally {
        setProfileLoading(false);
      }
    } catch (error) {
      setErrorMessage(getAuthError(error instanceof Error ? error.message : ''));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setErrorMessage('Conexão com o serviço de acesso não configurada. Avise o administrador.');
      return;
    }
    if (password.length < 8) {
      setErrorMessage('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('As senhas não coincidem. Confira os dois campos.');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    setNotice('');
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: fullName.trim() },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) {
        setErrorMessage(getAuthError(error));
        return;
      }

      setPassword('');
      setConfirmPassword('');
      if (data.session && data.user) {
        setSession(data.session);
        setProfileLoading(true);
        try {
          const currentProfile = await readMemberProfile(supabase, data.user.id);
          setProfile(currentProfile);
          setAccessState(currentProfile?.status ?? 'missing');
        } catch {
          setProfile(null);
          setAccessState('error');
        } finally {
          setProfileLoading(false);
        }
      } else {
        setMode('login');
        setNotice('Se o cadastro puder ser concluído, enviaremos uma confirmação para esse endereço. Depois da confirmação, o acesso aos dados ainda dependerá da aprovação do administrador.');
      }
    } catch (error) {
      setErrorMessage(getAuthError(error instanceof Error ? error.message : ''));
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setErrorMessage('Conexão com o serviço de acesso não configurada. Avise o administrador.');
      return;
    }
    setSubmitting(true);
    setErrorMessage('');
    setNotice('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      });
      if (error) {
        setErrorMessage(getAuthError(error));
        return;
      }
      setNotice('Se esse endereço estiver cadastrado, você receberá um link para redefinir a senha. Confira também a caixa de spam.');
    } catch (error) {
      setErrorMessage(getAuthError(error instanceof Error ? error.message : ''));
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasswordUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    if (password.length < 8) {
      setErrorMessage('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('As senhas não coincidem. Confira os dois campos.');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    setNotice('');
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErrorMessage(getAuthError(error));
        return;
      }
      setPassword('');
      setConfirmPassword('');
      const { error: signOutError } = await supabase.auth.signOut();
      if (!signOutError) {
        setSession(null);
        setProfile(null);
        setAccessState(null);
        setMode('login');
        setNotice('Senha atualizada. Entre com a nova senha.');
      } else {
        setMode('login');
        setNotice('Senha atualizada. Sua sessão de recuperação continua ativa; saia da conta para entrar novamente.');
      }
    } catch (error) {
      setErrorMessage(getAuthError(error instanceof Error ? error.message : ''));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    if (!supabase) return;
    setLogoutError('');
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        setLogoutError('Não foi possível encerrar a sessão. Tente novamente.');
        return;
      }
      setSession(null);
      setProfile(null);
      setAccessState(null);
      setEmail('');
      setPassword('');
      setNotice('');
      setMode('login');
    } catch {
      setLogoutError('Não foi possível encerrar a sessão. Verifique a conexão e tente novamente.');
    }
  }

  const displayName = profile?.full_name.trim() || session?.user.email || 'Integrante';

  if (!supabaseConfigured) {
    return (
      <div className="access-message access-message-warning" role="alert">
        <h2 id="auth-title">Conexão ainda não configurada</h2>
        <p>O endereço público e a chave publishable do Supabase precisam estar definidos no ambiente de hospedagem.</p>
      </div>
    );
  }

  if (booting) {
    return (
      <div className="loading-state" role="status" aria-live="polite">
        <span className="loading-dot" />
        <h2 id="auth-title">Verificando seu acesso</h2>
        <p>Um instante enquanto conferimos a sessão.</p>
      </div>
    );
  }

  if (mode === 'update-password') {
    return (
      <>
        <p className="eyebrow">RECUPERAÇÃO SEGURA</p>
        <h2 id="auth-title">Crie uma nova senha.</h2>
        <p className="form-intro">Escolha uma senha com pelo menos 8 caracteres e confirme para salvar.</p>
        <form className="login-form" onSubmit={(event) => void handlePasswordUpdate(event)}>
          <label htmlFor="new-password">Nova senha</label>
          <input
            autoComplete="new-password"
            id="new-password"
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
          <label htmlFor="confirm-new-password">Confirme a nova senha</label>
          <input
            autoComplete="new-password"
            id="confirm-new-password"
            minLength={8}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            type="password"
            value={confirmPassword}
          />
          {errorMessage && <p className="form-error" role="alert">{errorMessage}</p>}
          {notice && <p className="form-notice" role="status">{notice}</p>}
          <button className="primary-button" disabled={submitting} type="submit">
            {submitting ? 'Salvando…' : 'Salvar nova senha'} <span aria-hidden="true">→</span>
          </button>
        </form>
      </>
    );
  }

  if (session) {
    return (
      <div className="member-state">
        <p className="eyebrow">SESSÃO ATIVA</p>
        <h2 id="auth-title">Olá, {displayName}</h2>
        {profileLoading ? (
          <p className="state-copy" role="status">Conferindo se seu perfil foi aprovado…</p>
        ) : accessState === 'active' && profile ? (
          <div className="access-message access-message-success" role="status">
            <strong>Acesso aprovado</strong>
            <p>{roleLabels[profile.role]}. A conexão da conta foi confirmada; as áreas de trabalho serão habilitadas na próxima etapa.</p>
          </div>
        ) : accessState === 'pending' ? (
          <div className="access-message access-message-warning" role="status">
            <strong>Cadastro aguardando aprovação</strong>
            <p>Sua conta ainda não tem acesso aos dados da equipe. Peça ao administrador para aprovar seu perfil.</p>
          </div>
        ) : accessState === 'suspended' ? (
          <div className="access-message access-message-warning" role="status">
            <strong>Acesso suspenso</strong>
            <p>Seu perfil não pode acessar o espaço da equipe. Fale com um administrador.</p>
          </div>
        ) : accessState === 'missing' ? (
          <div className="access-message access-message-warning" role="status">
            <strong>Perfil da equipe não encontrado</strong>
            <p>Esta conta não está vinculada a um perfil da equipe. Entre em contato com o administrador.</p>
          </div>
        ) : (
          <div className="access-message access-message-warning" role="alert">
            <strong>Não foi possível validar a aprovação</strong>
            <p>Nenhum dado da equipe foi carregado. Tente novamente mais tarde ou contate o administrador.</p>
          </div>
        )}
        {notice && <p className="form-notice" role="status">{notice}</p>}
        {logoutError && <p className="form-error" role="alert">{logoutError}</p>}
        <button className="primary-button secondary-button" type="button" onClick={() => void handleLogout()}>
          Sair da conta <span aria-hidden="true">↗</span>
        </button>
      </div>
    );
  }

  const modeTabs = mode === 'login' || mode === 'signup';

  return (
    <>
      {modeTabs ? (
        <div className="auth-mode-switch" aria-label="Escolha uma opção de acesso">
          <button
            aria-pressed={mode === 'login'}
            className={mode === 'login' ? 'is-selected' : ''}
            onClick={() => switchMode('login')}
            type="button"
          >
            Entrar
          </button>
          <button
            aria-pressed={mode === 'signup'}
            className={mode === 'signup' ? 'is-selected' : ''}
            onClick={() => switchMode('signup')}
            type="button"
          >
            Criar cadastro
          </button>
        </div>
      ) : (
        <button className="auth-back-link" onClick={() => switchMode('login')} type="button">
          <span aria-hidden="true">←</span> Voltar para entrar
        </button>
      )}

      {mode === 'login' && (
        <>
          <p className="eyebrow">BEM-VINDO DE VOLTA</p>
          <h2 id="auth-title">Entre para seguir a rota.</h2>
          <p className="form-intro">Acesse sua conta para acompanhar a equipe SolMar Celeris.</p>
          <form className="login-form" onSubmit={(event) => void handleLogin(event)}>
            <label htmlFor="email">E-mail</label>
            <input
              autoComplete="email"
              id="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Digite seu e-mail"
              required
              type="email"
              value={email}
            />
            <div className="password-label-row">
              <label htmlFor="password">Senha</label>
              <button className="auth-text-button" onClick={() => switchMode('reset')} type="button">
                Esqueci minha senha
              </button>
            </div>
            <input
              autoComplete="current-password"
              id="password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Digite sua senha"
              required
              type="password"
              value={password}
            />
            {errorMessage && <p className="form-error" role="alert">{errorMessage}</p>}
            {notice && <p className="form-notice" role="status">{notice}</p>}
            <button className="primary-button" disabled={submitting} type="submit">
              {submitting ? 'Verificando…' : 'Entrar'} <span aria-hidden="true">→</span>
            </button>
          </form>
          <p className="auth-footnote">Cadastros novos precisam de aprovação antes de acessar os dados da equipe.</p>
        </>
      )}

      {mode === 'signup' && (
        <>
          <p className="eyebrow">FAÇA PARTE DA EQUIPE</p>
          <h2 id="auth-title">Crie seu cadastro.</h2>
          <p className="form-intro">Depois de confirmar o e-mail, seu perfil ainda precisa ser aprovado pelo administrador.</p>
          <form className="login-form" onSubmit={(event) => void handleSignup(event)}>
            <label htmlFor="full-name">Nome</label>
            <input
              autoComplete="name"
              id="full-name"
              maxLength={120}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Seu nome"
              required
              type="text"
              value={fullName}
            />
            <label htmlFor="signup-email">E-mail</label>
            <input
              autoComplete="email"
              id="signup-email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Digite seu e-mail"
              required
              type="email"
              value={email}
            />
            <label htmlFor="signup-password">Senha</label>
            <input
              autoComplete="new-password"
              id="signup-password"
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Pelo menos 8 caracteres"
              required
              type="password"
              value={password}
            />
            <label htmlFor="signup-confirm-password">Confirme a senha</label>
            <input
              autoComplete="new-password"
              id="signup-confirm-password"
              minLength={8}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Digite a senha novamente"
              required
              type="password"
              value={confirmPassword}
            />
            {errorMessage && <p className="form-error" role="alert">{errorMessage}</p>}
            {notice && <p className="form-notice" role="status">{notice}</p>}
            <button className="primary-button" disabled={submitting} type="submit">
              {submitting ? 'Criando cadastro…' : 'Criar cadastro'} <span aria-hidden="true">→</span>
            </button>
          </form>
          <p className="auth-footnote">Seu perfil começa como pendente; nenhum dado da equipe fica visível até a aprovação.</p>
        </>
      )}

      {mode === 'reset' && (
        <>
          <p className="eyebrow">RECUPERE SEU ACESSO</p>
          <h2 id="auth-title">Redefina sua senha.</h2>
          <p className="form-intro">Informe seu e-mail e enviaremos um link, caso exista uma conta para esse endereço.</p>
          <form className="login-form" onSubmit={(event) => void handlePasswordReset(event)}>
            <label htmlFor="reset-email">E-mail</label>
            <input
              autoComplete="email"
              id="reset-email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Digite seu e-mail"
              required
              type="email"
              value={email}
            />
            {errorMessage && <p className="form-error" role="alert">{errorMessage}</p>}
            {notice && <p className="form-notice" role="status">{notice}</p>}
            <button className="primary-button" disabled={submitting} type="submit">
              {submitting ? 'Enviando…' : 'Enviar link de redefinição'} <span aria-hidden="true">→</span>
            </button>
          </form>
        </>
      )}
    </>
  );
}
