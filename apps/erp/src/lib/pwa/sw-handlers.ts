export type PushPayload = {
  title?: string;
  body?: string;
  url?: string;
  data?: Record<string, string>;
};

export type PushData = { json: () => unknown; text: () => string };

export const DEFAULT_TITLE = "Edura";
export const DEFAULT_URL = "/";

export const NOTIFICATION_ICON = "/notification-icon.png";
export const NOTIFICATION_BADGE = "/notification-badge.png";

export function parsePushPayload(data: PushData | null | undefined): PushPayload {
  if (!data) return {};
  try {
    const parsed = data.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as PushPayload;
    }
    return { body: String(parsed) };
  } catch {
    try {
      const text = data.text();
      return text ? { body: text } : {};
    } catch {
      return {};
    }
  }
}

export type NotificationSpec = {
  title: string;
  options: {
    body?: string;
    icon: string;
    badge: string;
    data: { url: string };
  };
};

export function notificationSpec(payload: PushPayload): NotificationSpec {
  return {
    title: payload.title ?? DEFAULT_TITLE,
    options: {
      body: payload.body,
      icon: NOTIFICATION_ICON,
      badge: NOTIFICATION_BADGE,
      data: { url: payload.url ?? payload.data?.url ?? DEFAULT_URL },
    },
  };
}

export type ClickTarget =
  | { action: "focus"; index: number; url: string }
  | { action: "navigate"; index: number; url: string }
  | { action: "open"; url: string };

function parseClient(clientUrl: string): URL | null {
  try {
    return new URL(clientUrl);
  } catch {
    return null;
  }
}

function samePage(clientUrl: string, targetUrl: string, origin: string): boolean {
  const a = parseClient(clientUrl);
  if (!a) return false;
  try {
    const b = new URL(targetUrl, origin);
    return a.origin === b.origin && a.pathname === b.pathname;
  } catch {
    return false;
  }
}

function sameOrigin(clientUrl: string, origin: string): boolean {
  const a = parseClient(clientUrl);
  return a !== null && a.origin === origin;
}

export function resolveClickTarget(
  url: string,
  clients: readonly { url: string }[],
  origin: string,
): ClickTarget {
  const already = clients.findIndex((c) => samePage(c.url, url, origin));
  if (already !== -1) return { action: "focus", index: already, url };

  const open = clients.findIndex((c) => sameOrigin(c.url, origin));
  if (open !== -1) return { action: "navigate", index: open, url };

  return { action: "open", url };
}
