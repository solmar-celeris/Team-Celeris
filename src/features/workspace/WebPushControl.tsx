import { useState } from 'react';
import { Bell, Check, LoaderCircle } from 'lucide-react';
import { enableWebPushFromUserGesture, isWebPushConfigured } from '../../lib/webOneSignal';

function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isHomeScreenApp(): boolean {
  if (typeof window === 'undefined') return false;
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
  return standaloneNavigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

export default function WebPushControl() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const iosInSafariTab = isIosDevice() && !isHomeScreenApp();

  if (!isWebPushConfigured()) {
    return <span className="workspace-push-note">Notificações web aguardam configuração</span>;
  }

  if (iosInSafariTab) {
    return (
      <span className="workspace-push-note" title="O iPhone exige a Tela de Início para Web Push">
        No iPhone: Compartilhar → Adicionar à Tela de Início; abra pelo ícone para ativar notificações.
      </span>
    );
  }

  async function handleEnable() {
    setBusy(true);
    setMessage('');
    try {
      const result = await enableWebPushFromUserGesture();
      if (result === 'enabled') setMessage('Notificações ativadas neste navegador.');
      else if (result === 'denied') setMessage('Permissão não concedida. Confira as configurações de notificações do navegador.');
      else if (result === 'unsupported') setMessage('Este navegador ou modo de navegação não oferece Web Push.');
      else setMessage('A configuração do OneSignal Web ainda não foi publicada.');
    } catch {
      setMessage('Não foi possível ativar agora. Confira a configuração Web do OneSignal e tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="workspace-push-control">
      <button type="button" className="workspace-push-button" onClick={() => void handleEnable()} disabled={busy}>
        {busy ? <LoaderCircle size={14} className="workspace-push-spinner" aria-hidden="true" /> : message.startsWith('Notificações ativadas') ? <Check size={14} aria-hidden="true" /> : <Bell size={14} aria-hidden="true" />}
        {busy ? 'Ativando…' : message.startsWith('Notificações ativadas') ? 'Notificações ativadas' : 'Ativar notificações'}
      </button>
      {message && <span className="workspace-push-note" role="status">{message}</span>}
    </div>
  );
}
