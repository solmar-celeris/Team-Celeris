type PushPayload = Record<string, unknown>;

type PushRoute = 'chat' | 'announcement' | 'activity' | 'calendar';

const workspaceTabRoutes = new Set(['feed', 'activities', 'calendar', 'availability', 'announcements', 'files', 'norms', 'chat', 'meetings']);

const handledPushKey = 'team-celeris:push-open';
const handledPushTtlMs = 30_000;

function asPayload(value: unknown): PushPayload | null {
  if (typeof value === 'string') {
    try {
      return asPayload(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const source = value as PushPayload;
  const nested = source.additionalData ?? source.additional_data ?? source.data;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return { ...source, ...(nested as PushPayload) };
  }
  return source;
}

function readString(payload: PushPayload, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function normalizeRoute(value: string | null): PushRoute | null {
  if (value === 'announcement_created') return 'announcement';
  if (value === 'activity_assigned') return 'activity';
  return value === 'chat' || value === 'announcement' || value === 'activity' || value === 'calendar'
    ? value
    : null;
}

function isSupportedRoute(params: URLSearchParams): boolean {
  const route = normalizeRoute(params.get('push'));
  if (!route) return workspaceTabRoutes.has(params.get('tab') ?? '');
  if (route === 'chat') {
    const messageId = params.get('message_id');
    const conversationType = params.get('conversation_type');
    const conversationId = params.get('conversation_id');
    return Boolean(messageId)
      && (conversationType === 'team' || conversationType === 'group' || conversationType === 'direct')
      && (conversationType === 'team' || Boolean(conversationId));
  }
  return Boolean(params.get('item_id'));
}

function destinationFromPayload(payload: PushPayload, currentHref: string): URL | null {
  let current: URL;
  try {
    current = new URL(currentHref);
  } catch {
    return null;
  }

  const rawTargetUrl = readString(payload, 'targetUrl', 'target_url');
  if (rawTargetUrl) {
    try {
      const candidate = new URL(rawTargetUrl, current.origin);
      const payloadRoute = normalizeRoute(readString(payload, 'push_type', 'push'));
      const candidateHasPush = Boolean(normalizeRoute(candidate.searchParams.get('push')));
      if (candidate.origin === current.origin
        && candidate.pathname === '/'
        && isSupportedRoute(candidate.searchParams)
        && (candidateHasPush || !payloadRoute)) {
        return candidate;
      }
    } catch {
      // Fall through to the structured push fields below.
    }
  }

  const route = normalizeRoute(readString(payload, 'push_type', 'push'));
  if (!route) {
    const tab = readString(payload, 'tab', 'destination_tab');
    if (!tab || !workspaceTabRoutes.has(tab)) return null;
    const directDestination = new URL('/', current.origin);
    directDestination.searchParams.set('tab', tab);
    return directDestination;
  }
  const destination = new URL('/', current.origin);
  destination.searchParams.set('push', route);

  if (route === 'chat') {
    destination.searchParams.set('tab', 'chat');
    const messageId = readString(payload, 'message_id');
    const conversationType = readString(payload, 'conversation_type');
    const conversationId = readString(payload, 'conversation_id');
    if (!messageId || (conversationType !== 'team' && conversationType !== 'group' && conversationType !== 'direct')) return null;
    if (conversationType !== 'team' && !conversationId) return null;
    destination.searchParams.set('message_id', messageId);
    if (conversationId) destination.searchParams.set('conversation_id', conversationId);
    destination.searchParams.set('conversation_type', conversationType);
    return destination;
  }

  const itemId = readString(payload, 'item_id');
  if (!itemId) return null;
  destination.searchParams.set('item_id', itemId);
  destination.searchParams.set('tab', route === 'calendar' ? 'calendar' : route === 'activity' ? 'activities' : 'announcements');
  if (route === 'calendar') {
    const date = readString(payload, 'event_date', 'date');
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) destination.searchParams.set('date', date);
  }
  return destination;
}

/** Navigates to a validated push destination and suppresses duplicate click callbacks. */
export function navigateToPushDestination(rawData: unknown, launchUrl?: string | null): void {
  if (typeof window === 'undefined') return;
  const payload = asPayload(rawData);
  if (!payload) return;
  if (launchUrl && !readString(payload, 'targetUrl', 'target_url')) payload.targetUrl = launchUrl;

  const destination = destinationFromPayload(payload, window.location.href);
  if (!destination) return;

  const destinationHref = destination.toString();
  const current = new URL(window.location.href);
  try {
    const previous = JSON.parse(window.sessionStorage.getItem(handledPushKey) ?? 'null') as { href?: unknown; at?: unknown } | null;
    if (previous?.href === destinationHref && typeof previous.at === 'number' && Date.now() - previous.at < handledPushTtlMs) return;
    window.sessionStorage.setItem(handledPushKey, JSON.stringify({ href: destinationHref, at: Date.now() }));
  } catch {
    // Navigation still proceeds if sessionStorage is unavailable in the browser or WebView.
  }

  if (current.origin === destination.origin
    && current.pathname === destination.pathname
    && current.search === destination.search) return;
  window.location.replace(destinationHref);
}

/**
 * Median calls this global function when a OneSignal notification is tapped.
 * targetUrl normally navigates natively; this handler is an idempotent fallback
 * if the WebView arrives at the app root with only the custom data payload.
 */
export function installMedianPushNavigation(): void {
  if (typeof window === 'undefined') return;

  const globalWindow = window as Window & {
    median_onesignal_push_opened?: (data: unknown) => void;
  };
  globalWindow.median_onesignal_push_opened = (rawData: unknown) => navigateToPushDestination(rawData);
}
