import type { CalendarProvider, ProviderAuth } from "./calendar.ts";
import { createTokenCache, jwtClaims, postForm, sleep } from "./calendar.ts";
import type { Config } from "./config.ts";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events"];

type GoogleEvent = {
  id: string;
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] };
};

/** Google Calendar in the host's primary calendar, with a Google Meet conference per event. */
export function createGoogleProvider(config: Config): CalendarProvider {
  const redirectUri = `${config.publicUrl}/api/calendar/google/callback`;
  const credentials = () => {
    if (!config.google) throw new Error("Google is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).");
    return { client_id: config.google.clientId, client_secret: config.google.clientSecret };
  };
  const tokens = createTokenCache(
    async (refreshToken) =>
      (await postForm(TOKEN_URL, { ...credentials(), grant_type: "refresh_token", refresh_token: refreshToken })) as {
        access_token: string;
        expires_in: number;
      },
  );

  async function call(auth: ProviderAuth, url: string, method: string, body?: unknown) {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${await tokens.get(auth)}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204 || (method === "DELETE" && (res.status === 404 || res.status === 410))) return null;
    const data = (await res.json()) as GoogleEvent & { error?: { message?: string } };
    if (!res.ok) throw new Error(`Google Calendar ${method} failed: ${data.error?.message ?? res.status}`);
    return data;
  }

  const meetUrl = (e: GoogleEvent) =>
    e.hangoutLink ?? e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ?? "";

  return {
    id: "google",
    meetingLabel: "Google Meet",
    configured: () => config.google !== null,

    authUrl(state) {
      const params = new URLSearchParams({
        client_id: credentials().client_id,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: SCOPES.join(" "),
        access_type: "offline",
        prompt: "consent",
        state,
      });
      return `${AUTH_URL}?${params}`;
    },

    async exchangeCode(code) {
      const data = await postForm(TOKEN_URL, { ...credentials(), grant_type: "authorization_code", code, redirect_uri: redirectUri });
      if (!data.refresh_token) throw new Error("Google did not return a refresh token.");
      return { refreshToken: String(data.refresh_token), email: String(jwtClaims(String(data.id_token ?? "")).email ?? "") };
    },

    async revoke(refreshToken) {
      tokens.forget(refreshToken);
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, { method: "POST" }).catch(() => {});
    },

    async createEvent(auth, input) {
      let event = await call(auth, `${EVENTS_URL}?conferenceDataVersion=1&sendUpdates=none`, "POST", {
        summary: input.summary,
        description: input.description,
        start: { dateTime: input.start },
        end: { dateTime: input.end },
        conferenceData: { createRequest: { requestId: input.requestId, conferenceSolutionKey: { type: "hangoutsMeet" } } },
      });
      // Conference creation is usually immediate but may report "pending"; poll briefly.
      for (let attempt = 0; event && !meetUrl(event) && attempt < 3; attempt++) {
        await sleep(1000);
        event = await call(auth, `${EVENTS_URL}/${event.id}`, "GET");
      }
      return { eventId: event?.id ?? "", meetingUrl: event ? meetUrl(event) : "" };
    },

    async moveEvent(auth, eventId, start, end) {
      await call(auth, `${EVENTS_URL}/${eventId}?sendUpdates=none`, "PATCH", { start: { dateTime: start }, end: { dateTime: end } });
    },

    async deleteEvent(auth, eventId) {
      await call(auth, `${EVENTS_URL}/${eventId}?sendUpdates=none`, "DELETE");
    },
  };
}
