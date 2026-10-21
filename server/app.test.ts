import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { createApi } from "./app.ts";
import type { CalendarProvider, Providers } from "./calendar.ts";
import { loadConfig } from "./config.ts";
import { openDatabase } from "./db.ts";
import type { Email } from "./notify.ts";

function fakeProvider(id: "google" | "microsoft", calls: string[], mailbox?: Email[]): CalendarProvider {
  return {
    id,
    meetingLabel: id === "google" ? "Google Meet" : "Microsoft Teams",
    configured: () => true,
    authUrl: (state) => `https://login.example/${id}?state=${state}`,
    exchangeCode: async () => ({ refreshToken: `${id}-refresh`, email: `kim@${id}.example` }),
    createEvent: async (_auth, input) => {
      calls.push(`${id} create ${input.start}`);
      return { eventId: `${id}-evt`, meetingUrl: `https://${id}.example/meet` };
    },
    moveEvent: async (_auth, eventId, start) => void calls.push(`${id} move ${eventId} ${start}`),
    deleteEvent: async (_auth, eventId) => void calls.push(`${id} delete ${eventId}`),
    revoke: async () => void calls.push(`${id} revoke`),
    sendMail: mailbox ? async (_auth, e) => void mailbox.push(e) : undefined,
  };
}

/** Runs the real API against an in-memory database with recording fakes for calendars and SMTP. */
async function setup(provider: "google" | "microsoft" = "google") {
  const db = openDatabase(":memory:");
  db.prepare("UPDATE hosts SET calendar_provider = ?, calendar_refresh_token = 'refresh' WHERE id = 1").run(provider);
  db.prepare("UPDATE event_types SET min_notice_minutes = 0").run();
  const calls: string[] = [];
  const sent: Email[] = [];
  const graphMail: Email[] = [];
  const providers: Providers = { google: fakeProvider("google", calls), microsoft: fakeProvider("microsoft", calls, graphMail) };

  const app = express().use("/api", createApi(db, { config: loadConfig({ PUBLIC_URL: "https://boka.test" }), providers, smtp: async (e) => void sent.push(e) }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const send = (method: string, path: string, body: unknown) =>
    fetch(base + path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), redirect: "manual" });
  return { db, base, post: (p: string, b: unknown) => send("POST", p, b), put: (p: string, b: unknown) => send("PUT", p, b), calls, sent, graphMail, close: () => server.close() };
}

const settle = () => new Promise((r) => setTimeout(r, 10));

async function firstSlots(base: string, count: number) {
  const now = Temporal.Now.plainDateISO("UTC");
  const slots: string[] = [];
  for (const month of [now.toPlainYearMonth(), now.toPlainYearMonth().add({ months: 1 })]) {
    const r = (await (await fetch(`${base}/public/kim/30min/slots?month=${month}&tz=UTC`)).json()) as { days: Record<string, string[]> };
    for (const day of Object.keys(r.days).sort()) slots.push(...r.days[day]);
  }
  return slots.slice(0, count);
}

test("booking creates a meeting and emails both parties; reschedule and cancel follow through", async () => {
  const t = await setup();
  try {
    const [first, second] = await firstSlots(t.base, 2);
    const res = await t.post("/public/kim/30min/book", { name: "Ada", email: "ada@example.com", timezone: "UTC", start: first });
    assert.equal(res.status, 201);
    const view = (await res.json()) as { booking: Record<string, unknown>; emailed: boolean };
    assert.equal(view.booking.meeting_url, "https://google.example/meet");
    assert.equal(view.booking.calendar_event_id, undefined, "internal calendar id is not exposed");
    assert.equal(view.emailed, true);
    await settle();
    assert.deepEqual(t.sent.map((e) => e.to), ["ada@example.com", "kim@example.com"]);
    assert.match(t.sent[0].text, /Join with Google Meet/);

    const token = view.booking.token as string;
    assert.equal((await t.post(`/bookings/${token}/reschedule`, { start: second })).status, 200);
    assert.equal((await t.post(`/bookings/${token}/cancel`, { reason: "Conflict" })).status, 200);
    await settle();
    assert.deepEqual(t.calls, [`google create ${first}`, `google move google-evt ${second}`, "google delete google-evt"]);
    assert.deepEqual(t.sent.map((e) => e.subject.split(":")[0]), ["Confirmed", "New event", "Updated", "Rescheduled", "Cancelled", "Cancelled"]);
  } finally {
    t.close();
  }
});

test("Microsoft 365: Teams meeting, Swedish emails sent from the O365 mailbox", async () => {
  const t = await setup("microsoft");
  try {
    const me = (await (await fetch(`${t.base}/me`)).json()) as Record<string, unknown>;
    assert.equal((await t.put("/me", { ...me, language: "sv", email_via: "microsoft" })).status, 200);
    const [start] = await firstSlots(t.base, 1);
    const view = (await (await t.post("/public/kim/30min/book", { name: "Ada", email: "ada@example.com", timezone: "UTC", start })).json()) as {
      booking: { meeting_url: string };
      host: { language: string; meeting_provider: string };
    };
    assert.equal(view.booking.meeting_url, "https://microsoft.example/meet");
    assert.deepEqual(view.host, { ...view.host, language: "sv", meeting_provider: "microsoft" });
    await settle();
    assert.deepEqual(t.calls, [`microsoft create ${start}`]);
    assert.equal(t.sent.length, 0, "SMTP is bypassed");
    assert.deepEqual(t.graphMail.map((e) => e.subject.split(":")[0]), ["Bekräftat", "Ny bokning"]);
    assert.match(t.graphMail[0].text, /Anslut via Microsoft Teams/);
  } finally {
    t.close();
  }
});

test("connecting a calendar replaces the previous provider", async () => {
  const t = await setup("google");
  try {
    const connect = await fetch(`${t.base}/calendar/microsoft/connect`, { redirect: "manual" });
    const state = new URL(connect.headers.get("location")!).searchParams.get("state")!;
    const cb = await fetch(`${t.base}/calendar/microsoft/callback?code=abc&state=${state}`, { redirect: "manual" });
    assert.equal(cb.headers.get("location"), "/app/settings?calendar=connected&provider=microsoft");
    const me = (await (await fetch(`${t.base}/me`)).json()) as Record<string, unknown>;
    assert.equal(me.calendar_provider, "microsoft");
    assert.equal(me.calendar_email, "kim@microsoft.example");
    assert.equal(me.calendar_refresh_token, undefined, "refresh token never leaves the server");
    assert.deepEqual(t.calls, ["google revoke"]);

    const replay = await fetch(`${t.base}/calendar/microsoft/callback?code=abc&state=${state}`, { redirect: "manual" });
    assert.match(replay.headers.get("location")!, /calendar=error/, "a state can't be used twice");
  } finally {
    t.close();
  }
});

test("event types without an online meeting don't touch the calendar", async () => {
  const t = await setup();
  try {
    const now = Temporal.Now.plainDateISO("UTC");
    const r = (await (await fetch(`${t.base}/public/kim/60min/slots?month=${now.toPlainYearMonth().add({ months: 1 })}&tz=UTC`)).json()) as {
      days: Record<string, string[]>;
    };
    const res = await t.post("/public/kim/60min/book", { name: "Bo", email: "bo@example.com", timezone: "UTC", start: Object.values(r.days)[0][0] });
    assert.equal(res.status, 201);
    assert.deepEqual(t.calls, []);
  } finally {
    t.close();
  }
});
