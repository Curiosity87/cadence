import type { CalendarProvider, ProviderAuth } from "./calendar.ts";
import { createTokenCache, jwtClaims, postForm, sleep } from "./calendar.ts";
import type { Config } from "./config.ts";

const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPES = ["openid", "email", "offline_access", "User.Read", "Calendars.ReadWrite", "Mail.Send"];

type GraphEvent = { id: string; onlineMeeting?: { joinUrl?: string } | null };

/**
 * Microsoft 365: events in the host's Outlook calendar with a Teams meeting, and optional email
 * delivery from the host's own mailbox through Microsoft Graph.
 */
export function createMicrosoftProvider(config: Config): CalendarProvider {
  const redirectUri = `${config.publicUrl}/api/calendar/microsoft/callback`;
  const ms = () => {
    if (!config.microsoft) throw new Error("Microsoft 365 is not configured (MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET).");
    return config.microsoft;
  };
  const tokenUrl = () => `https://login.microsoftonline.com/${ms().tenant}/oauth2/v2.0/token`;
  const tokens = createTokenCache(
    async (refreshToken) =>
      (await postForm(tokenUrl(), {
        client_id: ms().clientId,
        client_secret: ms().clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: SCOPES.join(" "),
      })) as { access_token: string; expires_in: number; refresh_token?: string },
  );

  async function call(auth: ProviderAuth, path: string, method: string, body?: unknown) {
    const res = await fetch(`${GRAPH}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await tokens.get(auth)}`,
        "Content-Type": "application/json",
        Prefer: 'outlook.timezone="UTC"',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 202 || res.status === 204 || (method === "DELETE" && res.status === 404)) return null;
    const data = (await res.json()) as GraphEvent & { error?: { message?: string } };
    if (!res.ok) throw new Error(`Microsoft Graph ${method} ${path} failed: ${data.error?.message ?? res.status}`);
    return data;
  }

  // Graph takes a wall-clock time plus a zone name rather than an offset.
  const graphTime = (iso: string) => ({ dateTime: new Date(iso).toISOString().replace("Z", ""), timeZone: "UTC" });

  return {
    id: "microsoft",
    meetingLabel: "Microsoft Teams",
    configured: () => config.microsoft !== null,

    authUrl(state) {
      const params = new URLSearchParams({
        client_id: ms().clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        response_mode: "query",
        scope: SCOPES.join(" "),
        prompt: "select_account",
        state,
      });
      return `https://login.microsoftonline.com/${ms().tenant}/oauth2/v2.0/authorize?${params}`;
    },

    async exchangeCode(code) {
      const data = await postForm(tokenUrl(), {
        client_id: ms().clientId,
        client_secret: ms().clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        scope: SCOPES.join(" "),
      });
      if (!data.refresh_token) throw new Error("Microsoft did not return a refresh token.");
      const claims = jwtClaims(String(data.id_token ?? ""));
      return { refreshToken: String(data.refresh_token), email: String(claims.email ?? claims.preferred_username ?? "") };
    },

    // Microsoft offers no per-token revocation for delegated apps; forgetting the token is enough here.
    async revoke(refreshToken) {
      tokens.forget(refreshToken);
    },

    async createEvent(auth, input) {
      let event = await call(auth, "/me/events", "POST", {
        subject: input.summary,
        body: { contentType: "text", content: input.description },
        start: graphTime(input.start),
        end: graphTime(input.end),
        isOnlineMeeting: true,
        onlineMeetingProvider: "teamsForBusiness",
        transactionId: input.requestId,
      });
      for (let attempt = 0; event && !event.onlineMeeting?.joinUrl && attempt < 3; attempt++) {
        await sleep(1000);
        event = await call(auth, `/me/events/${event.id}?$select=id,onlineMeeting`, "GET");
      }
      return { eventId: event?.id ?? "", meetingUrl: event?.onlineMeeting?.joinUrl ?? "" };
    },

    async moveEvent(auth, eventId, start, end) {
      await call(auth, `/me/events/${eventId}`, "PATCH", { start: graphTime(start), end: graphTime(end) });
    },

    async deleteEvent(auth, eventId) {
      await call(auth, `/me/events/${eventId}`, "DELETE");
    },

    async sendMail(auth, email) {
      await call(auth, "/me/sendMail", "POST", {
        message: {
          subject: email.subject,
          body: { contentType: "HTML", content: email.html },
          toRecipients: [{ emailAddress: { address: email.to } }],
          attachments: email.ics
            ? [
                {
                  "@odata.type": "#microsoft.graph.fileAttachment",
                  name: "invite.ics",
                  contentType: `text/calendar; method=${email.ics.method}`,
                  contentBytes: Buffer.from(email.ics.content).toString("base64"),
                },
              ]
            : [],
        },
        saveToSentItems: true,
      });
    },
  };
}
