type PushPayload = Record<string, unknown>;

type PushRoute = 'chat' | 'announcement' | 'activity' | 'calendar';

const handledPushKey = 'team-celeris:median-push-open';
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
  if (!route) return false;
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
      if ((candidate.protocol === 'https:' || candidate.origin === current.origin)
        && candidate.pathname === '/'
        && isSupportedRoute(candidate.searchParams)) {
        return candidate;
      }
    } catch {
      // Fall through to the structured push fields below.
    }
  }

  const route = normalizeRoute(readString(payload, 'push_type', 'push'));
  if (!route) return null;
  const destination = new URL('/', current.origin);
  destination.searchParams.set('push', route);

  if (route === 'chat') {
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
  if (route === 'calendar') {
    const date = readString(payload, 'event_date', 'date');
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) destination.searchParams.set('date', date);
  }
  return destination;
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
  globalWindow.median_onesignal_push_opened = (rawData: unknown) => {
    const payload = asPayload(rawData);
    if (!payload) return;

    const destination = destinationFromPayload(payload, window.location.href);
    if (!destination) return;

    const destinationHref = destination.toString();
    const current = new URL(window.location.href);
    try {
      const previous = JSON.parse(window.sessionStorage.getItem(handledPushKey) ?? 'null') as { href?: unknown; at?: unknown } | null;
      if (previous?.href === destinationHref && typeof previous.at === 'number' && Date.now() - previous.at < handledPushTtlMs) return;
      window.sessionStorage.setItem(handledPushKey, JSON.stringify({ href: destinationHref, at: Date.now() }));
    } catch {
      // Navigation still proceeds if sessionStorage is unavailable in the WebView.
    }

    if (current.origin === destination.origin
      && current.pathname === destination.pathname
      && current.search === destination.search) return;
    window.location.replace(destinationHref);
  };
}
