import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "./config.ts";
import { createMicrosoftProvider } from "./microsoft.ts";

/** Exercises the real Graph request shapes against a stubbed fetch. */
test("creates an Outlook event with a Teams meeting and persists rotated refresh tokens", async (t) => {
  const requests: { url: string; method: string; body: any }[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    const body = typeof init.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : Object.fromEntries(new URLSearchParams(String(init.body ?? "")));
    requests.push({ url, method: init.method ?? "GET", body });
    if (url.includes("/oauth2/v2.0/token")) {
      return Response.json({ access_token: "access-1", expires_in: 3600, refresh_token: "refresh-2" });
    }
    if (url.endsWith("/me/events")) {
      return Response.json({ id: "evt-9", onlineMeeting: { joinUrl: "https://teams.microsoft.com/l/meetup-join/abc" } }, { status: 201 });
    }
    return new Response(null, { status: 204 });
  });

  const config = loadConfig({ PUBLIC_URL: "https://boka.test", MICROSOFT_CLIENT_ID: "cid", MICROSOFT_CLIENT_SECRET: "secret", MICROSOFT_TENANT_ID: "contoso" });
  const ms = createMicrosoftProvider(config);
  const rotated: string[] = [];
  const auth = { refreshToken: "refresh-1", onRefreshToken: (r: string) => void rotated.push(r) };

  const result = await ms.createEvent(auth, {
    requestId: "tok-1",
    summary: "30 Minute Meeting: Ada",
    description: "Notes",
    start: "2026-11-02T08:00:00Z",
    end: "2026-11-02T08:30:00Z",
  });
  assert.deepEqual(result, { eventId: "evt-9", meetingUrl: "https://teams.microsoft.com/l/meetup-join/abc" });
  assert.deepEqual(rotated, ["refresh-2"]);

  const [token, create] = requests;
  assert.equal(token.url, "https://login.microsoftonline.com/contoso/oauth2/v2.0/token");
  assert.equal(token.body.grant_type, "refresh_token");
  assert.equal(create.url, "https://graph.microsoft.com/v1.0/me/events");
  assert.deepEqual(create.body.start, { dateTime: "2026-11-02T08:00:00.000", timeZone: "UTC" });
  assert.equal(create.body.isOnlineMeeting, true);
  assert.equal(create.body.onlineMeetingProvider, "teamsForBusiness");
  assert.equal(create.body.attendees, undefined, "no attendees, so Outlook sends no invitations of its own");

  await ms.deleteEvent(auth, "evt-9");
  assert.equal(requests.at(-1)!.method, "DELETE");
  assert.equal(requests.filter((r) => r.url.includes("/token")).length, 1, "access token is reused");

  const url = new URL(ms.authUrl("state-1"));
  assert.equal(url.origin + url.pathname, "https://login.microsoftonline.com/contoso/oauth2/v2.0/authorize");
  assert.equal(url.searchParams.get("redirect_uri"), "https://boka.test/api/calendar/microsoft/callback");
  assert.match(url.searchParams.get("scope")!, /Calendars\.ReadWrite/);
  assert.match(url.searchParams.get("scope")!, /offline_access/);
});
