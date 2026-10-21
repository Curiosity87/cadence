import type { CalendarProviderId } from "./db.ts";
import type { Email } from "./notify.ts";

/** A connected account's refresh token, plus a hook to persist a rotated one. */
export type ProviderAuth = { refreshToken: string; onRefreshToken: (token: string) => void };

export type CalendarEventInput = {
  /** Stable per booking; used as an idempotency key where the provider supports one. */
  requestId: string;
  summary: string;
  description: string;
  start: string;
  end: string;
};

/**
 * A calendar account the host connects with OAuth. Events are created only in the host's own
 * calendar (no attendees), so the provider never sends invitations of its own; the app's emails do.
 */
export interface CalendarProvider {
  id: CalendarProviderId;
  /** Name of the video meeting the provider attaches, e.g. "Google Meet". */
  meetingLabel: string;
  configured(): boolean;
  authUrl(state: string): string;
  exchangeCode(code: string): Promise<{ refreshToken: string; email: string }>;
  createEvent(auth: ProviderAuth, input: CalendarEventInput): Promise<{ eventId: string; meetingUrl: string }>;
  moveEvent(auth: ProviderAuth, eventId: string, start: string, end: string): Promise<void>;
  deleteEvent(auth: ProviderAuth, eventId: string): Promise<void>;
  revoke(refreshToken: string): Promise<void>;
  /** Present when the provider can send email from the connected mailbox. */
  sendMail?(auth: ProviderAuth, email: Email): Promise<void>;
}

export type Providers = Record<CalendarProviderId, CalendarProvider>;

/** Caches short-lived access tokens per refresh token and persists rotated refresh tokens. */
export function createTokenCache(
  refresh: (refreshToken: string) => Promise<{ access_token: string; expires_in: number; refresh_token?: string }>,
) {
  const cache = new Map<string, { accessToken: string; expiresAt: number }>();
  return {
    async get(auth: ProviderAuth) {
      const hit = cache.get(auth.refreshToken);
      if (hit && hit.expiresAt > Date.now() + 60_000) return hit.accessToken;
      const data = await refresh(auth.refreshToken);
      const entry = { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
      cache.set(auth.refreshToken, entry);
      if (data.refresh_token && data.refresh_token !== auth.refreshToken) {
        cache.set(data.refresh_token, entry);
        auth.onRefreshToken(data.refresh_token);
      }
      return entry.accessToken;
    },
    forget(refreshToken: string) {
      cache.delete(refreshToken);
    },
  };
}

export async function postForm(url: string, params: Record<string, string>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, string | number | undefined>;
  if (!res.ok) throw new Error(`Token request failed: ${data.error_description ?? data.error ?? res.status}`);
  return data;
}

export function jwtClaims(idToken: string): Record<string, unknown> {
  try {
    return JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString());
  } catch {
    return {};
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
