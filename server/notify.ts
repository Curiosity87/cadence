import nodemailer from "nodemailer";
import type { Config } from "./config.ts";
import type { Booking, EventType, Host, Language } from "./db.ts";

export type Change =
  | { kind: "booked" }
  | { kind: "rescheduled"; previousStart: string }
  | { kind: "cancelled"; by: "invitee" | "host"; reason: string };

export type EmailContext = {
  booking: Booking;
  eventType: EventType;
  host: Host;
  publicUrl: string;
  /** "Google Meet" / "Microsoft Teams" for online meetings from the connected calendar. */
  meetingLabel: string;
};

export type Email = {
  to: string;
  subject: string;
  text: string;
  html: string;
  ics?: { method: "REQUEST" | "CANCEL"; content: string };
};

type Strings = {
  locale: string;
  location: Record<Exclude<EventType["location_kind"], "online_meeting">, string> & { online_meeting: string };
  what: string;
  when: string;
  where: string;
  notes: string;
  reason: string;
  previously: string;
  join: (label: string) => string;
  manage: string;
  viewMeetings: string;
  bookAgain: string;
  with: string;
  subject: {
    confirmed: string;
    newEvent: string;
    updated: string;
    rescheduled: string;
    cancelled: string;
  };
  hi: (name: string) => string;
  bookedInvitee: (host: string) => string;
  bookedHost: (invitee: string, email: string) => string;
  movedInvitee: (host: string) => string;
  movedHost: (invitee: string) => string;
  cancelledByInvitee: (host: string) => string;
  cancelledByHost: (host: string) => string;
  hostCancelledOwn: (invitee: string) => string;
  inviteeCancelled: (invitee: string) => string;
};

const STRINGS: Record<Language, Strings> = {
  en: {
    locale: "en-GB",
    location: { online_meeting: "Online meeting", video: "Video call", phone: "Phone call", in_person: "In person" },
    what: "What",
    when: "When",
    where: "Where",
    notes: "Notes",
    reason: "Reason",
    previously: "Previously",
    join: (label) => `Join with ${label}`,
    manage: "Reschedule or cancel",
    viewMeetings: "View your meetings",
    bookAgain: "Book a new time",
    with: "with",
    subject: { confirmed: "Confirmed", newEvent: "New event", updated: "Updated", rescheduled: "Rescheduled", cancelled: "Cancelled" },
    hi: (name) => `Hi ${name},`,
    bookedInvitee: (host) => `your meeting with ${host} is scheduled.`,
    bookedHost: (invitee, email) => `${invitee} (${email}) booked a meeting with you.`,
    movedInvitee: (host) => `your meeting with ${host} has a new time.`,
    movedHost: (invitee) => `${invitee} moved their meeting with you.`,
    cancelledByInvitee: (host) => `your meeting with ${host} has been cancelled.`,
    cancelledByHost: (host) => `${host} has cancelled your meeting.`,
    hostCancelledOwn: (invitee) => `You cancelled the meeting with ${invitee}.`,
    inviteeCancelled: (invitee) => `${invitee} cancelled their meeting with you.`,
  },
  sv: {
    locale: "sv-SE",
    location: { online_meeting: "Onlinemöte", video: "Videosamtal", phone: "Telefonsamtal", in_person: "Fysiskt möte" },
    what: "Vad",
    when: "När",
    where: "Var",
    notes: "Anteckningar",
    reason: "Anledning",
    previously: "Tidigare",
    join: (label) => `Anslut via ${label}`,
    manage: "Boka om eller avboka",
    viewMeetings: "Visa dina möten",
    bookAgain: "Boka en ny tid",
    with: "med",
    subject: { confirmed: "Bekräftat", newEvent: "Ny bokning", updated: "Ändrat", rescheduled: "Ombokat", cancelled: "Avbokat" },
    hi: (name) => `Hej ${name},`,
    bookedInvitee: (host) => `ditt möte med ${host} är bokat.`,
    bookedHost: (invitee, email) => `${invitee} (${email}) har bokat ett möte med dig.`,
    movedInvitee: (host) => `ditt möte med ${host} har fått en ny tid.`,
    movedHost: (invitee) => `${invitee} har flyttat sitt möte med dig.`,
    cancelledByInvitee: (host) => `ditt möte med ${host} har avbokats.`,
    cancelledByHost: (host) => `${host} har avbokat ert möte.`,
    hostCancelledOwn: (invitee) => `Du avbokade mötet med ${invitee}.`,
    inviteeCancelled: (invitee) => `${invitee} har avbokat sitt möte med dig.`,
  },
};

/** Builds the invitee's and the host's emails for one booking change, in the host's chosen language. */
export function buildEmails(change: Change, ctx: EmailContext): Email[] {
  const { booking: b, eventType: et, host } = ctx;
  const s = STRINGS[host.language] ?? STRINGS.en;
  const manageUrl = `${ctx.publicUrl}/booking/${b.token}`;
  const dashboardUrl = `${ctx.publicUrl}/app/meetings`;
  const locationName = et.location_kind === "online_meeting" ? ctx.meetingLabel || s.location.online_meeting : s.location[et.location_kind];
  const location = b.meeting_url || et.location_detail || locationName;
  const joinLink = b.meeting_url ? { label: s.join(locationName), url: b.meeting_url } : undefined;
  const title = (prefix: string, rest: string) => `${prefix}: ${rest}`;
  const withHost = `${et.title} ${s.with} ${host.name}`;
  const withInvitee = `${b.invitee_name} – ${et.title}`;

  const details = (timeZone: string) => [
    [s.what, et.title],
    [s.when, formatWhen(b.start_utc, b.end_utc, timeZone, s.locale)],
    [s.where, location],
  ] as const;
  const inviteeTz = b.invitee_timezone;
  const hostTz = host.timezone;
  const ics = (method: "REQUEST" | "CANCEL") => ({ method, content: buildIcs(method, ctx, withHost, location, manageUrl, s) });
  const greet = (line: string) => `${s.hi(b.invitee_name)} ${line}`;

  switch (change.kind) {
    case "booked":
      return [
        email(b.invitee_email, title(s.subject.confirmed, withHost), {
          intro: greet(s.bookedInvitee(host.name)),
          rows: details(inviteeTz),
          link: joinLink,
          footer: { label: s.manage, url: manageUrl },
          ics: ics("REQUEST"),
        }),
        email(host.email, title(s.subject.newEvent, withInvitee), {
          intro: s.bookedHost(b.invitee_name, b.invitee_email),
          rows: [...details(hostTz), ...(b.notes ? ([[s.notes, b.notes]] as const) : [])],
          link: joinLink,
          footer: { label: s.viewMeetings, url: dashboardUrl },
        }),
      ];
    case "rescheduled": {
      const was = (tz: string) =>
        [[s.previously, formatWhen(change.previousStart, addMinutes(change.previousStart, et.duration), tz, s.locale)]] as const;
      return [
        email(b.invitee_email, title(s.subject.updated, withHost), {
          intro: greet(s.movedInvitee(host.name)),
          rows: [...details(inviteeTz), ...was(inviteeTz)],
          link: joinLink,
          footer: { label: s.manage, url: manageUrl },
          ics: ics("REQUEST"),
        }),
        email(host.email, title(s.subject.rescheduled, withInvitee), {
          intro: s.movedHost(b.invitee_name),
          rows: [...details(hostTz), ...was(hostTz)],
          footer: { label: s.viewMeetings, url: dashboardUrl },
        }),
      ];
    }
    case "cancelled": {
      const reason = change.reason ? ([[s.reason, change.reason]] as const) : [];
      const byInvitee = change.by === "invitee";
      return [
        email(b.invitee_email, title(s.subject.cancelled, withHost), {
          intro: greet(byInvitee ? s.cancelledByInvitee(host.name) : s.cancelledByHost(host.name)),
          rows: [...details(inviteeTz), ...reason],
          footer: { label: s.bookAgain, url: `${ctx.publicUrl}/${host.slug}/${et.slug}` },
          ics: ics("CANCEL"),
        }),
        email(host.email, title(s.subject.cancelled, withInvitee), {
          intro: byInvitee ? s.inviteeCancelled(b.invitee_name) : s.hostCancelledOwn(b.invitee_name),
          rows: [...details(hostTz), ...reason],
          footer: { label: s.viewMeetings, url: dashboardUrl },
        }),
      ];
    }
  }
}

/** Sends email over SMTP; null when SMTP isn't configured. */
export function createSmtpMailer(config: Config) {
  if (!config.smtp) return null;
  const smtp = config.smtp;
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  });
  return async (e: Email) => {
    await transport.sendMail({
      from: smtp.from,
      to: e.to,
      subject: e.subject,
      text: e.text,
      html: e.html,
      icalEvent: e.ics ? { method: e.ics.method, filename: "invite.ics", content: e.ics.content } : undefined,
    });
  };
}

export type SendEmail = (email: Email) => Promise<void>;

type Body = {
  intro: string;
  rows: readonly (readonly [string, string])[];
  link?: { label: string; url: string };
  footer: { label: string; url: string };
  ics?: Email["ics"];
};

function email(to: string, subject: string, body: Body): Email {
  const text = [
    body.intro,
    "",
    ...body.rows.map(([k, v]) => `${k}: ${v}`),
    ...(body.link ? ["", `${body.link.label}: ${body.link.url}`] : []),
    "",
    `${body.footer.label}: ${body.footer.url}`,
  ].join("\n");

  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;color:#0b3558">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border:1px solid #dae4ef;border-radius:8px" cellpadding="0" cellspacing="0">
<tr><td style="padding:28px 28px 8px;font-size:16px;line-height:1.5">${escape(body.intro)}</td></tr>
<tr><td style="padding:8px 28px"><table role="presentation" cellpadding="0" cellspacing="0" style="font-size:15px;line-height:1.5">
${body.rows.map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#476788;vertical-align:top;white-space:nowrap">${escape(k)}</td><td style="padding:4px 0">${linkify(v)}</td></tr>`).join("\n")}
</table></td></tr>
${body.link ? `<tr><td style="padding:16px 28px"><a href="${escape(body.link.url)}" style="display:inline-block;background:#006bff;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:40px">${escape(body.link.label)}</a></td></tr>` : ""}
<tr><td style="padding:16px 28px 28px;border-top:1px solid #dae4ef;font-size:14px"><a href="${escape(body.footer.url)}" style="color:#006bff">${escape(body.footer.label)}</a></td></tr>
</table></td></tr></table></body></html>`;

  return { to, subject, text, html, ics: body.ics };
}

function buildIcs(method: "REQUEST" | "CANCEL", ctx: EmailContext, summary: string, location: string, manageUrl: string, s: Strings) {
  const { booking: b, host } = ctx;
  const domain = new URL(ctx.publicUrl).hostname || "localhost";
  const description = [b.meeting_url && `${s.join(ctx.meetingLabel || s.location.online_meeting)}: ${b.meeting_url}`, `${s.manage}: ${manageUrl}`]
    .filter(Boolean)
    .join("\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Cadence//Scheduling//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${b.token}@${domain}`,
    `SEQUENCE:${b.sequence}`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(b.start_utc)}`,
    `DTEND:${icsDate(b.end_utc)}`,
    `SUMMARY:${icsText(summary)}`,
    `DESCRIPTION:${icsText(description)}`,
    `LOCATION:${icsText(location)}`,
    ...(b.meeting_url ? [`URL:${b.meeting_url}`] : []),
    `ORGANIZER;CN=${icsText(host.name)}:mailto:${host.email}`,
    `ATTENDEE;CN=${icsText(b.invitee_name)};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:${b.invitee_email}`,
    `STATUS:${method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldIcsLine).join("\r\n");
}

function formatWhen(startIso: string, endIso: string, timeZone: string, locale: string) {
  const date = new Intl.DateTimeFormat(locale, { timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(startIso));
  const time = (iso: string) => new Intl.DateTimeFormat(locale, { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
  return `${date}, ${time(startIso)}–${time(endIso)} (${timeZone.replaceAll("_", " ")})`;
}

const addMinutes = (iso: string, minutes: number) => new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
const icsDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");

/** RFC 5545: lines longer than 75 octets continue on the next line, indented by one space. */
function foldIcsLine(line: string) {
  const parts: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut)) > 75) cut--;
    parts.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  parts.push(rest);
  return parts.join("\r\n");
}

function escape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function linkify(s: string) {
  return /^https?:\/\/\S+$/.test(s) ? `<a href="${escape(s)}" style="color:#006bff">${escape(s)}</a>` : escape(s);
}
