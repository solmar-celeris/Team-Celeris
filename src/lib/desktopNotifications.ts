import { navigateToPushDestination } from './medianPushNavigation';

type OneSignalWebSdk = {
  init: (options: {
    appId: string;
    serviceWorkerPath: string;
    serviceWorkerParam: { scope: string };
    notificationClickHandlerMatch: 'exact' | 'origin';
    notificationClickHandlerAction: 'navigate' | 'focus';
  }) => Promise<void>;
  login: (externalId: string) => Promise<void>;
  logout: () => Promise<void>;
  Notifications: {
    isPushSupported: () => boolean;
    permission: boolean;
    requestPermission: () => Promise<void>;
    addEventListener: (event: 'click', listener: (event: unknown) => void) => void;
  };
  User: {
    PushSubscription: {
      optedIn: boolean;
      optIn: () => Promise<void>;
      optOut: () => Promise<void>;
    };
  };
};

type OneSignalDeferredCallback = (sdk: OneSignalWebSdk) => void | Promise<void>;

declare global {
  interface Window {
    OneSignalDeferred?: OneSignalDeferredCallback[];
  }
}

export type DesktopNotificationStatus =
  | 'enabled'
  | 'disabled'
  | 'permission_required'
  | 'blocked'
  | 'not_configured'
  | 'not_supported'
  | 'app_webview';

let sdkPromise: Promise<OneSignalWebSdk> | null = null;
let desiredExternalId: string | null = null;
let identityRevision = 0;

const ONESIGNAL_SCRIPT_ID = 'solmar-onesignal-web-sdk';
const ONESIGNAL_SCRIPT_URL = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
const SERVICE_WORKER_PATH = 'push/onesignal/OneSignalSDKWorker.js';
const SERVICE_WORKER_SCOPE = '/push/onesignal/';

function appId(): string {
  return import.meta.env.VITE_ONESIGNAL_APP_ID?.trim() ?? '';
}

function isNativeWebView(): boolean {
  return typeof window !== 'undefined' && Boolean(window.median?.onesignal);
}

function browserCanUseWebPush(): boolean {
  return typeof window !== 'undefined'
    && window.isSecureContext
    && 'serviceWorker' in navigator
    && 'Notification' in window;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(...values: unknown[]): string | null {
  return values.find((value): value is string => typeof value === 'string' && Boolean(value.trim()))?.trim() ?? null;
}

function handleWebNotificationClick(rawEvent: unknown): void {
  const event = asRecord(rawEvent);
  const notification = asRecord(event?.notification);
  const result = asRecord(event?.result);
  const additionalData = notification?.additionalData
    ?? notification?.additional_data
    ?? notification?.data
    ?? event?.additionalData
    ?? event?.data
    ?? rawEvent;
  const launchUrl = stringValue(
    notification?.launchURL,
    notification?.launchUrl,
    notification?.url,
    result?.url,
  );
  navigateToPushDestination({ additionalData, targetUrl: launchUrl }, launchUrl);
}

async function initializeOneSignal(): Promise<OneSignalWebSdk> {
  if (sdkPromise) return sdkPromise;
  const configuredAppId = appId();
  if (!configuredAppId) throw new Error('VITE_ONESIGNAL_APP_ID_NOT_CONFIGURED');
  if (!browserCanUseWebPush()) throw new Error('WEB_PUSH_NOT_SUPPORTED');
  if (isNativeWebView()) throw new Error('USE_NATIVE_PUSH_IN_APP');

  sdkPromise = new Promise<OneSignalWebSdk>((resolve, reject) => {
    const deferred = window.OneSignalDeferred ?? [];
    window.OneSignalDeferred = deferred;
    deferred.push(async (sdk) => {
      try {
        await sdk.init({
          appId: configuredAppId,
          serviceWorkerPath: SERVICE_WORKER_PATH,
          serviceWorkerParam: { scope: SERVICE_WORKER_SCOPE },
          notificationClickHandlerMatch: 'origin',
          notificationClickHandlerAction: 'navigate',
        });
        sdk.Notifications.addEventListener('click', handleWebNotificationClick);
        resolve(sdk);
      } catch (error) {
        sdkPromise = null;
        reject(error);
      }
    });

    if (!document.getElementById(ONESIGNAL_SCRIPT_ID)) {
      const script = document.createElement('script');
      script.id = ONESIGNAL_SCRIPT_ID;
      script.src = ONESIGNAL_SCRIPT_URL;
      script.async = true;
      script.onerror = () => {
        sdkPromise = null;
        reject(new Error('ONESIGNAL_WEB_SDK_LOAD_FAILED'));
      };
      document.head.appendChild(script);
    }
  });
  return sdkPromise;
}

/** Mantém a assinatura do navegador associada à conta autenticada, sem pedir permissão automaticamente. */
export function syncDesktopOneSignalIdentity(userId: string | null): () => void {
  const revision = ++identityRevision;
  desiredExternalId = userId;
  if (isNativeWebView() || !appId()) return () => {};

  if (!userId) {
    if (sdkPromise) {
      void sdkPromise.then((sdk) => {
        if (revision === identityRevision) return sdk.logout();
        return undefined;
      }).catch(() => {});
    }
    return () => {};
  }

  if (!browserCanUseWebPush()) return () => {};
  void initializeOneSignal().then(async (sdk) => {
    if (revision !== identityRevision || desiredExternalId !== userId) return;
    await sdk.login(userId);
  }).catch(() => {
    // Push indisponível não deve impedir o login ou o uso normal do sistema.
  });

  return () => {
    if (revision === identityRevision) identityRevision += 1;
  };
}

export async function getDesktopNotificationStatus(): Promise<DesktopNotificationStatus> {
  if (isNativeWebView()) return 'app_webview';
  if (!appId()) return 'not_configured';
  if (!browserCanUseWebPush()) return 'not_supported';
  if (Notification.permission === 'denied') return 'blocked';

  try {
    const sdk = await initializeOneSignal();
    if (!sdk.Notifications.isPushSupported()) return 'not_supported';
    if (sdk.User.PushSubscription.optedIn) return 'enabled';
    if (Notification.permission === 'default') return 'permission_required';
    return 'disabled';
  } catch {
    return 'not_supported';
  }
}

/** Só deve ser chamada em resposta ao clique explícito da pessoa usuária. */
export async function enableDesktopNotifications(userId: string): Promise<DesktopNotificationStatus> {
  const sdk = await initializeOneSignal();
  await sdk.login(userId);
  await sdk.User.PushSubscription.optIn();
  return getDesktopNotificationStatus();
}

export async function disableDesktopNotifications(): Promise<DesktopNotificationStatus> {
  const sdk = await initializeOneSignal();
  await sdk.User.PushSubscription.optOut();
  return getDesktopNotificationStatus();
}
