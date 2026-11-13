import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, Copy, ExternalLink, Link2, LogOut, Video } from 'lucide-react';
import './meetings-workspace.css';

type JitsiEvent = { displayName?: string; message?: string; type?: string };
type JitsiMeetingApi = {
  addListener: (event: string, listener: (payload?: JitsiEvent) => void) => void;
  dispose: () => void;
};
type JitsiMeetingApiConstructor = new (domain: string, options: {
  roomName: string;
  parentNode: HTMLElement;
  width: string;
  height: string;
  lang: string;
  userInfo: { displayName: string };
  configOverwrite: Record<string, unknown>;
}) => JitsiMeetingApi;

type MeetingsWorkspaceProps = { displayName: string; onRoomActiveChange: (active: boolean) => void };

const JITSI_DOMAIN = 'meet.jit.si';
let apiScriptPromise: Promise<void> | null = null;

function loadJitsiApi(): Promise<void> {
  if ((window as Window & { JitsiMeetExternalAPI?: JitsiMeetingApiConstructor }).JitsiMeetExternalAPI) {
    return Promise.resolve();
  }
  if (apiScriptPromise) return apiScriptPromise;

  apiScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-solmar-jitsi-api]');
    const script = existing ?? document.createElement('script');
    const onLoad = () => {
      if ((window as Window & { JitsiMeetExternalAPI?: JitsiMeetingApiConstructor }).JitsiMeetExternalAPI) resolve();
      else {
        script.remove();
        reject(new Error('A API do Jitsi carregou sem disponibilizar o controle da reunião.'));
      }
    };
    const onError = () => {
      script.remove();
      reject(new Error('Não foi possível carregar a API do Jitsi. Verifique a conexão e tente novamente.'));
    };
    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });
    if (!existing) {
      script.src = `https://${JITSI_DOMAIN}/external_api.js`;
      script.async = true;
      script.dataset.solmarJitsiApi = 'true';
      document.head.appendChild(script);
    }
  }).catch((error: unknown) => {
    apiScriptPromise = null;
    throw error;
  });
  return apiScriptPromise;
}

function createRoomName(): string {
  const id = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replaceAll('-', '')
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, '0')).join('');
  return `solmar-${id}`;
}

function getRoomName(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== JITSI_DOMAIN || url.username || url.password) return null;
    const room = decodeURIComponent(url.pathname.split('/').filter(Boolean)[0] ?? '');
    return /^[a-zA-Z0-9_-]{3,128}$/.test(room) ? room : null;
  } catch {
    return /^[a-zA-Z0-9_-]{3,128}$/.test(value) ? value : null;
  }
}

export default function MeetingsWorkspace({ displayName, onRoomActiveChange }: MeetingsWorkspaceProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const displayNameRef = useRef(displayName);
  const [roomInput, setRoomInput] = useState('');
  const [activeRoom, setActiveRoom] = useState('');
  const [roomLabel, setRoomLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => { displayNameRef.current = displayName; }, [displayName]);
  useEffect(() => { onRoomActiveChange(Boolean(activeRoom)); }, [activeRoom, onRoomActiveChange]);

  useEffect(() => {
    if (!activeRoom || !mountRef.current) return;
    let cancelled = false;
    let api: JitsiMeetingApi | null = null;
    setLoading(true);
    setJoined(false);
    setError('');
    setNotice('Conectando ao serviço Jitsi…');

    void loadJitsiApi().then(() => {
      if (cancelled || !mountRef.current) return;
      const JitsiMeetExternalAPI = (window as Window & { JitsiMeetExternalAPI?: JitsiMeetingApiConstructor }).JitsiMeetExternalAPI;
      if (!JitsiMeetExternalAPI) throw new Error('A API do Jitsi não está disponível neste navegador.');
      api = new JitsiMeetExternalAPI(JITSI_DOMAIN, {
        roomName: activeRoom,
        parentNode: mountRef.current,
        width: '100%',
        height: '100%',
        lang: 'ptBR',
        userInfo: { displayName: displayNameRef.current.trim() || 'Integrante SolMar' },
        configOverwrite: {
          startWithAudioMuted: true,
          startWithVideoMuted: true,
          prejoinConfig: { enabled: true },
          enableWelcomePage: false,
        },
      });
      api.addListener('videoConferenceJoined', () => {
        if (cancelled) return;
        setLoading(false);
        setJoined(true);
        setNotice('Você entrou na reunião. Microfone e câmera começam desligados; ative-os nos controles do Jitsi.');
      });
      api.addListener('videoConferenceLeft', () => {
        if (cancelled) return;
        setJoined(false);
        setActiveRoom('');
        setNotice('Você saiu da reunião. O link continua disponível para compartilhar ou entrar novamente.');
      });
      api.addListener('cameraError', (event) => {
        if (!cancelled) setError(event?.message || 'O Jitsi não conseguiu acessar a câmera. Verifique a permissão do navegador.');
      });
      api.addListener('readyToClose', () => {
        if (cancelled) return;
        setJoined(false);
        setActiveRoom('');
      });
    }).catch((reason: unknown) => {
      if (cancelled) return;
      const message = reason instanceof Error ? reason.message : 'Não foi possível iniciar a reunião.';
      setError(message);
      setLoading(false);
      setNotice('Se o serviço exigir autenticação do organizador dentro do quadro, abra a sala no Jitsi em uma nova aba e entre com sua conta.');
    });

    return () => {
      cancelled = true;
      api?.dispose();
    };
  }, [activeRoom]);

  function startMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const title = roomLabel.trim() || 'Reunião da equipe';
    const room = createRoomName();
    setRoomInput(room);
    setRoomLabel(title);
    setActiveRoom(room);
  }

  function joinMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const room = getRoomName(roomInput);
    if (!room) {
      setError('Informe um código de sala válido ou um link https://meet.jit.si/…');
      return;
    }
    setError('');
    setRoomInput(room);
    setRoomLabel('Reunião da equipe');
    setActiveRoom(room);
  }

  async function copyInvite() {
    const invite = `https://${JITSI_DOMAIN}/${activeRoom}`;
    try {
      await navigator.clipboard.writeText(invite);
      setNotice('Link da reunião copiado. Compartilhe-o apenas com as pessoas convidadas.');
    } catch {
      setNotice(`Copie este convite: ${invite}`);
    }
  }

  function leaveMeeting() {
    setJoined(false);
    setActiveRoom('');
    setNotice('Você saiu da reunião.');
  }

  const activeInvite = activeRoom ? `https://${JITSI_DOMAIN}/${activeRoom}` : '';

  return (
    <section className="meetings-workspace" aria-labelledby="meetings-title">
      <header className="meetings-intro">
        <div><p className="meetings-eyebrow">CHAMADAS AO VIVO</p><h2 id="meetings-title">Reuniões da equipe</h2><p>Inicie uma sala ou entre com o código/link recebido. O Jitsi fornece os controles de áudio, vídeo, compartilhamento de tela, participantes e efeitos disponíveis.</p></div>
        {!activeRoom && <span className="meetings-provider"><Video size={16} aria-hidden="true" /> Jitsi Meet</span>}
      </header>

      <aside className="meetings-provider-notice" aria-label="Informações sobre o serviço de reunião">
        <strong>Reunião hospedada pelo Jitsi público</strong>
        <p>O organizador precisa entrar com uma conta Jitsi; convidados podem entrar sem conta. No meet.jit.si, todos os participantes têm controles de moderação e as reuniões têm limite atual de 95 minutos. O link da sala dá acesso à chamada: envie-o apenas aos convidados. Seu nome de perfil será compartilhado com os participantes e com o serviço.</p>
        <a href="https://jitsi.org/security/" target="_blank" rel="noopener noreferrer">Ler informações oficiais de segurança e privacidade <ExternalLink size={12} aria-hidden="true" /></a>
      </aside>

      {error && <p className="meetings-alert" role="alert">{error}</p>}
      {notice && <p className="meetings-status" role="status">{notice}</p>}

      {!activeRoom ? (
        <div className="meetings-start-panel">
          <form className="meetings-create-form" onSubmit={startMeeting}>
            <div><span className="meetings-form-eyebrow">NOVA SALA</span><h3>Começar uma reunião</h3><p>Um código aleatório é gerado para reduzir o risco de outras pessoas encontrarem a sala.</p></div>
            <label><span>Nome para identificar a reunião (opcional)</span><input maxLength={100} value={roomLabel} onChange={(event) => setRoomLabel(event.target.value)} placeholder="Ex.: Reunião de planejamento" /></label>
            <button type="submit" className="meetings-primary-button"><Video size={16} aria-hidden="true" />Iniciar reunião</button>
          </form>
          <div className="meetings-divider"><span>ou entre em uma sala existente</span></div>
          <form className="meetings-join-form" onSubmit={joinMeeting}>
            <label><span>Código da sala ou link do Jitsi</span><input value={roomInput} onChange={(event) => setRoomInput(event.target.value)} placeholder="solmar-… ou https://meet.jit.si/…" autoComplete="off" /></label>
            <button type="submit" className="meetings-secondary-button"><Link2 size={15} aria-hidden="true" />Entrar na sala</button>
          </form>
        </div>
      ) : (
        <div className="meetings-live-panel">
          <div className="meetings-live-toolbar">
            <div className="meetings-live-title"><span className={joined ? 'meetings-live-dot is-live' : 'meetings-live-dot'} /><div><strong>{roomLabel || 'Reunião da equipe'}</strong><small>{joined ? 'Conectado' : loading ? 'Conectando…' : 'Aguardando entrada'}</small></div></div>
            <div className="meetings-live-actions">
              <button type="button" className="meetings-secondary-button" onClick={() => void copyInvite()}><Copy size={14} aria-hidden="true" />Copiar convite</button>
              <a className="meetings-secondary-button" href={activeInvite} target="_blank" rel="noopener noreferrer"><ArrowUpRight size={14} aria-hidden="true" />Abrir no Jitsi</a>
              <button type="button" className="meetings-leave-button" onClick={leaveMeeting}><LogOut size={14} aria-hidden="true" />Sair da sala</button>
            </div>
          </div>
          <div className="meetings-invite-line"><span>Convite:</span><a href={activeInvite} target="_blank" rel="noopener noreferrer">{activeInvite}</a></div>
          {loading && <div className="meetings-connecting" role="status">Carregando a reunião. Se for solicitada autenticação do organizador, entre na sua conta Jitsi ou use “Abrir no Jitsi”.</div>}
          <div className="meetings-iframe-shell">
            <div className="meetings-iframe-mount" ref={mountRef} aria-label="Sala de videoconferência Jitsi" />
          </div>
          <p className="meetings-controls-note">O quadro do Jitsi contém os controles da chamada. Microfone e câmera iniciam desligados. Para compartilhar a tela ou alterar o fundo, use os botões e menus dentro da reunião; essas opções dependem do navegador e do dispositivo.</p>
        </div>
      )}
    </section>
  );
}
