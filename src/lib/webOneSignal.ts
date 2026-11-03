import OneSignal from 'react-onesignal';

const webAppId = import.meta.env.VITE_ONESIGNAL_APP_ID?.trim() ?? '';
let initialization: Promise<void> | null = null;

export function isWebPushConfigured(): boolean {
  return Boolean(webAppId) && typeof window !== 'undefined' && !window.median;
}

export async function initializeWebPush(): Promise<boolean> {
  if (typeof window === 'undefined' || !webAppId || window.median) return false;
  if (!initialization) {
    initialization = OneSignal.init({
      appId: webAppId,
      serviceWorkerPath: 'OneSignalSDKWorker.js',
      serviceWorkerParam: { scope: '/' },
    }).catch((error: unknown) => {
      initialization = null;
      throw error;
    });
  }
  await initialization;
  return true;
}

export async function syncWebOneSignalIdentity(userId: string | null): Promise<void> {
  if (!userId) return;
  if (await initializeWebPush()) await OneSignal.login(userId);
}

export async function logoutWebOneSignal(): Promise<void> {
  if (!initialization) return;
  try {
    await initialization;
    await OneSignal.logout();
  } catch {
    // Falha de push não deve impedir o encerramento da sessão no Supabase.
  }
}

export async function enableWebPushFromUserGesture(): Promise<'enabled' | 'unsupported' | 'denied' | 'not_configured'> {
  if (!webAppId) return 'not_configured';
  if (typeof window === 'undefined' || !('Notification' in window) || !OneSignal.Notifications.isPushSupported()) {
    return 'unsupported';
  }
  await initializeWebPush();
  const granted = await OneSignal.Notifications.requestPermission();
  if (!granted) return 'denied';
  await OneSignal.User.PushSubscription.optIn();
  return 'enabled';
}
