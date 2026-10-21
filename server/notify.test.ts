import { test } from "node:test";
import assert from "node:assert/strict";
import type { Booking, EventType, Host } from "./db.ts";
import { buildEmails, type EmailContext } from "./notify.ts";

const host: Host = {
  id: 1, name: "Kim Lidberg", slug: "kim", email: "kim@example.com", timezone: "Europe/Stockholm", welcome: "",
  language: "en", calendar_provider: "google", calendar_refresh_token: "r", calendar_email: "", email_via: "smtp",
};
const eventType = { id: 2, host_id: 1, title: "30 Minute Meeting", slug: "30min", duration: 30, location_kind: "online_meeting", location_detail: "" } as EventType;
const booking: Booking = {
  id: 1, token: "tok-123", event_type_id: 2, start_utc: "2026-11-02T08:00:00Z", end_utc: "2026-11-02T08:30:00Z",
  invitee_name: "Ada Lovelace", invitee_email: "ada@example.com", invitee_timezone: "America/New_York", notes: "Agenda; <b>pricing</b>",
  status: "active", cancel_reason: "", created_at: "", meeting_url: "https://meet.google.com/abc-defg-hij",
  calendar_provider: "google", calendar_event_id: "g1", sequence: 0,
};
const ctx: EmailContext = { booking, eventType, host, publicUrl: "https://boka.example.com", meetingLabel: "Google Meet" };

test("booking emails go to invitee and host, each in their own time zone", () => {
  const [invitee, owner] = buildEmails({ kind: "booked" }, ctx);
  assert.equal(invitee.to, "ada@example.com");
  assert.equal(invitee.subject, "Confirmed: 30 Minute Meeting with Kim Lidberg");
  assert.match(invitee.text, /03:00–03:30 \(America\/New York\)/);
  assert.match(invitee.text, /Join with Google Meet: https:\/\/meet\.google\.com\/abc-defg-hij/);
  assert.match(invitee.text, /https:\/\/boka\.example\.com\/booking\/tok-123/);
  assert.equal(owner.to, "kim@example.com");
  assert.match(owner.text, /09:00–09:30 \(Europe\/Stockholm\)/);
  assert.match(owner.html, /&lt;b&gt;pricing&lt;\/b&gt;/, "notes are HTML-escaped");
  assert.equal(owner.ics, undefined);
});

test("invitee gets a calendar invite; cancellation sends a matching CANCEL", () => {
  const [booked] = buildEmails({ kind: "booked" }, ctx);
  assert.equal(booked.ics?.method, "REQUEST");
  assert.match(booked.ics!.content, /UID:tok-123@boka\.example\.com/);
  assert.match(booked.ics!.content, /DTSTART:20261102T080000Z/);
  for (const line of booked.ics!.content.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75, `line too long: ${line}`);

  const [cancelled, owner] = buildEmails({ kind: "cancelled", by: "host", reason: "Sick" }, { ...ctx, booking: { ...booking, sequence: 1 } });
  assert.equal(cancelled.ics?.method, "CANCEL");
  assert.match(cancelled.ics!.content, /SEQUENCE:1/);
  assert.match(cancelled.text, /Kim Lidberg has cancelled/);
  assert.match(owner.text, /You cancelled/);
  assert.match(cancelled.text, /Reason: Sick/);
});

test("reschedule emails mention the previous time", () => {
  const [invitee] = buildEmails({ kind: "rescheduled", previousStart: "2026-11-01T15:00:00Z" }, ctx);
  assert.match(invitee.subject, /^Updated:/);
  assert.match(invitee.text, /Previously: Sunday, 1 November 2026, 10:00–10:30/);
});

test("emails follow the host's language and the connected meeting provider", () => {
  const sv: EmailContext = {
    ...ctx,
    host: { ...host, language: "sv" },
    meetingLabel: "Microsoft Teams",
    booking: { ...booking, meeting_url: "https://teams.microsoft.com/l/meetup-join/x" },
  };
  const [invitee, owner] = buildEmails({ kind: "booked" }, sv);
  assert.equal(invitee.subject, "Bekräftat: 30 Minute Meeting med Kim Lidberg");
  assert.match(invitee.text, /^Hej Ada Lovelace, ditt möte med Kim Lidberg är bokat\./);
  assert.match(invitee.text, /När: måndag 2 november 2026, 03:00–03:30/);
  assert.match(invitee.text, /Anslut via Microsoft Teams: https:\/\/teams\.microsoft\.com/);
  assert.match(invitee.text, /Boka om eller avboka:/);
  assert.equal(owner.subject, "Ny bokning: Ada Lovelace – 30 Minute Meeting");
});
