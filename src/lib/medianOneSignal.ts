type MedianOneSignalBridge = {
  login: (externalId: string) => void | Promise<void>;
  logout: () => void | Promise<void>;
};

declare global {
  interface Window {
    median?: { onesignal?: MedianOneSignalBridge };
  }
}

/**
 * Vincula o UUID estável do Supabase ao OneSignal no WebView do Median.
 * Em um navegador comum, o bridge não existe e nenhuma chamada é feita.
 */
export function syncMedianOneSignalIdentity(userId: string | null, shouldLogout: boolean): () => void {
  if (typeof window === 'undefined' || (!userId && !shouldLogout)) return () => {};

  let cancelled = false;
  let attempts = 0;
  let timer: number | undefined;

  const trySync = (): boolean => {
    if (cancelled) return true;
    const bridge = window.median?.onesignal;
    if (!bridge) return false;

    try {
      const operation = userId ? bridge.login(userId) : bridge.logout();
      if (operation && typeof operation.then === 'function') void operation.catch(() => {});
    } catch {
      // A falha da ponte nativa nunca bloqueia login, logout ou uso do Chat no site.
    }
    return true;
  };

  if (trySync()) return () => {};

  timer = window.setInterval(() => {
    attempts += 1;
    if (trySync() || attempts >= 20) {
      if (timer !== undefined) window.clearInterval(timer);
    }
  }, 250);

  return () => {
    cancelled = true;
    if (timer !== undefined) window.clearInterval(timer);
  };
}
