import express, { type Request, type Response, type NextFunction } from "express";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Config } from "./config.ts";
import { randomBytes } from "node:crypto";
import type { CalendarProvider, ProviderAuth, Providers } from "./calendar.ts";
import type { AvailabilityRule, Booking, CalendarProviderId, EventType, Host } from "./db.ts";
import { buildEmails, type Change, type SendEmail } from "./notify.ts";
import { availableSlots, isSlotAvailable } from "./slots.ts";

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const HOST_ID = 1; // Single-host app: there is no login, the host dashboard edits host 1.

export type Integrations = { config: Config; providers: Providers; smtp: SendEmail | null };

const PROVIDER_IDS: CalendarProviderId[] = ["google", "microsoft"];

export function createApi(db: DatabaseSync, { config, providers, smtp }: Integrations) {
  const api = express.Router();
  api.use(express.json());

  api.get("/health", (_req, res) => {
    db.prepare("SELECT 1").get();
    res.json({ ok: true });
  });

  const getHost = () => db.prepare("SELECT * FROM hosts WHERE id = ?").get(HOST_ID) as Host;
  const hostBySlug = (slug: string) => {
    const host = db.prepare("SELECT * FROM hosts WHERE slug = ?").get(slug) as Host | undefined;
    if (!host) throw new HttpError(404, "This scheduling page does not exist.");
    return host;
  };
  const eventBySlug = (host: Host, slug: string) => {
    const et = db
      .prepare("SELECT * FROM event_types WHERE host_id = ? AND slug = ? AND active = 1")
      .get(host.id, slug) as EventType | undefined;
    if (!et) throw new HttpError(404, "This event type is not available.");
    return et;
  };
  const rulesFor = (hostId: number) =>
    db.prepare("SELECT * FROM availability_rules WHERE host_id = ? ORDER BY weekday, start_minute").all(hostId) as AvailabilityRule[];
  const busyFor = (hostId: number, excludeBookingId = 0) =>
    db
      .prepare(
        `SELECT b.start_utc, b.end_utc FROM bookings b JOIN event_types e ON e.id = b.event_type_id
         WHERE e.host_id = ? AND b.status = 'active' AND b.end_utc > ? AND b.id != ?`,
      )
      .all(hostId, new Date().toISOString(), excludeBookingId) as { start_utc: string; end_utc: string }[];
  const bookingByToken = (token: string) => {
    const booking = db.prepare("SELECT * FROM bookings WHERE token = ?").get(token) as Booking | undefined;
    if (!booking) throw new HttpError(404, "Booking not found.");
    return booking;
  };
  const bookingContext = (b: Booking) => {
    const eventType = db.prepare("SELECT * FROM event_types WHERE id = ?").get(b.event_type_id) as EventType;
    const host = db.prepare("SELECT * FROM hosts WHERE id = ?").get(eventType.host_id) as Host;
    return { booking: b, eventType, host };
  };
  const bookingView = (b: Booking) => {
    const { eventType, host } = bookingContext(b);
    const { calendar_event_id: _, ...booking } = b;
    return { booking, eventType, host: publicHost(host), emailed: emailSender(host) !== null };
  };
  const ownerView = () => {
    const { calendar_refresh_token, ...host } = getHost();
    return {
      ...host,
      calendar_provider: calendar_refresh_token ? host.calendar_provider : "",
      providers_configured: { google: providers.google.configured(), microsoft: providers.microsoft.configured() },
      smtp_configured: smtp !== null,
      email_enabled: emailSender(getHost()) !== null,
    };
  };

  // ---------- Calendar and email plumbing ----------

  /** The host's connected calendar, if any. */
  const connected = (host: Host): CalendarProvider | null =>
    host.calendar_provider && host.calendar_refresh_token && providers[host.calendar_provider].configured()
      ? providers[host.calendar_provider]
      : null;
  const authFor = (host: Host): ProviderAuth => ({
    refreshToken: host.calendar_refresh_token,
    onRefreshToken: (token) => db.prepare("UPDATE hosts SET calendar_refresh_token = ? WHERE id = ?").run(token, host.id),
  });
  const meetingLabel = (host: Host) => connected(host)?.meetingLabel ?? "";

  /** Microsoft 365 mailbox when chosen and connected, otherwise SMTP; null means email is off. */
  function emailSender(host: Host): SendEmail | null {
    const provider = connected(host);
    if (host.email_via === "microsoft" && provider?.sendMail) return (e) => provider.sendMail!(authFor(host), e);
    return smtp;
  }

  /** Emails go out in the background; a mail server hiccup must never fail a booking. */
  function notify(change: Change, token: string) {
    const ctx = bookingContext(bookingByToken(token));
    const send = emailSender(ctx.host);
    const emails = buildEmails(change, { ...ctx, publicUrl: config.publicUrl, meetingLabel: meetingLabel(ctx.host) });
    if (!send) {
      for (const e of emails) console.log(`[email not sent: no email delivery configured] to=${e.to} subject="${e.subject}"`);
      return;
    }
    void (async () => {
      for (const e of emails) {
        if (!e.to) continue;
        try {
          await send(e);
        } catch (err) {
          console.error(`Failed to send email to ${e.to}:`, err);
        }
      }
    })();
  }

  async function createCalendarEvent(b: Booking) {
    const { eventType, host } = bookingContext(b);
    const provider = connected(host);
    if (eventType.location_kind !== "online_meeting" || !provider) return;
    try {
      const { eventId, meetingUrl } = await provider.createEvent(authFor(host), {
        requestId: b.token,
        summary: `${eventType.title}: ${b.invitee_name}`,
        description: [b.notes, `${b.invitee_name} <${b.invitee_email}>`].filter(Boolean).join("\n\n"),
        start: b.start_utc,
        end: b.end_utc,
      });
      db.prepare("UPDATE bookings SET calendar_provider = ?, calendar_event_id = ?, meeting_url = ? WHERE id = ?").run(
        provider.id,
        eventId,
        meetingUrl,
        b.id,
      );
    } catch (err) {
      console.error(`Could not create ${provider.id} calendar event:`, err);
    }
  }

  async function updateCalendarEvent(b: Booking, action: "move" | "delete") {
    const { host } = bookingContext(b);
    const provider = connected(host);
    // Only the account that created the event can change it.
    if (!b.calendar_event_id || !provider || provider.id !== b.calendar_provider) return;
    try {
      if (action === "move") await provider.moveEvent(authFor(host), b.calendar_event_id, b.start_utc, b.end_utc);
      else await provider.deleteEvent(authFor(host), b.calendar_event_id);
    } catch (err) {
      console.error(`Could not ${action} ${provider.id} calendar event:`, err);
    }
  }

  api.get("/locale", (_req, res) => {
    const host = getHost();
    res.json({ language: host.language, hostSlug: host.slug });
  });

  // ---------- Public booking pages ----------

  api.get("/public/:host", (req, res) => {
    const host = hostBySlug(req.params.host);
    const eventTypes = db.prepare("SELECT * FROM event_types WHERE host_id = ? AND active = 1 ORDER BY duration").all(host.id);
    res.json({ host: publicHost(host), eventTypes });
  });

  api.get("/public/:host/:event", (req, res) => {
    const host = hostBySlug(req.params.host);
    res.json({ host: publicHost(host), eventType: eventBySlug(host, req.params.event) });
  });

  api.get("/public/:host/:event/slots", (req, res) => {
    const host = hostBySlug(req.params.host);
    const eventType = eventBySlug(host, req.params.event);
    const timezone = parseTimezone(req.query.tz);
    const month = parseMonth(req.query.month);
    const days = availableSlots({
      eventType,
      hostTimezone: host.timezone,
      rules: rulesFor(host.id),
      busy: busyFor(host.id),
      from: month.toPlainDate({ day: 1 }),
      to: month.toPlainDate({ day: month.daysInMonth }),
      inviteeTimezone: timezone,
    });
    res.json({ timezone, days });
  });

  api.post("/public/:host/:event/book", async (req, res) => {
    const host = hostBySlug(req.params.host);
    const eventType = eventBySlug(host, req.params.event);
    const body = req.body ?? {};
    const name = requireText(body.name, "Name");
    const email = requireEmail(body.email);
    const timezone = parseTimezone(body.timezone);
    const start = parseInstant(body.start);

    // Check-then-insert inside one write transaction so two invitees can't take the same slot.
    const token = randomUUID();
    db.exec("BEGIN IMMEDIATE");
    try {
      const ok = isSlotAvailable(
        { eventType, hostTimezone: host.timezone, rules: rulesFor(host.id), busy: busyFor(host.id), inviteeTimezone: timezone },
        start.toString(),
      );
      if (!ok) throw new HttpError(409, "That time is no longer available. Please pick another.");
      db.prepare(
        `INSERT INTO bookings (token, event_type_id, start_utc, end_utc, invitee_name, invitee_email, invitee_timezone, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        token,
        eventType.id,
        start.toString(),
        start.add({ minutes: eventType.duration }).toString(),
        name,
        email,
        timezone,
        String(body.notes ?? "").slice(0, 2000),
        new Date().toISOString(),
      );
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    await createCalendarEvent(bookingByToken(token));
    notify({ kind: "booked" }, token);
    res.status(201).json(bookingView(bookingByToken(token)));
  });

  // ---------- Invitee self-service (by secret token) ----------

  api.get("/bookings/:token", (req, res) => {
    res.json(bookingView(bookingByToken(req.params.token)));
  });

  api.post("/bookings/:token/cancel", async (req, res) => {
    const b = bookingByToken(req.params.token);
    await cancelBooking(b, String(req.body?.reason ?? ""), "invitee");
    res.json(bookingView(bookingByToken(b.token)));
  });

  api.post("/bookings/:token/reschedule", async (req, res) => {
    const b = bookingByToken(req.params.token);
    if (b.status !== "active") throw new HttpError(409, "This booking was cancelled.");
    const { eventType } = bookingView(b);
    const start = parseInstant(req.body?.start);
    const hostRow = db.prepare("SELECT * FROM hosts WHERE id = ?").get(eventType.host_id) as Host;
    db.exec("BEGIN IMMEDIATE");
    try {
      const ok = isSlotAvailable(
        {
          eventType,
          hostTimezone: hostRow.timezone,
          rules: rulesFor(hostRow.id),
          busy: busyFor(hostRow.id, b.id),
          inviteeTimezone: b.invitee_timezone,
        },
        start.toString(),
      );
      if (!ok) throw new HttpError(409, "That time is no longer available. Please pick another.");
      db.prepare("UPDATE bookings SET start_utc = ?, end_utc = ?, sequence = sequence + 1 WHERE id = ?").run(
        start.toString(),
        start.add({ minutes: eventType.duration }).toString(),
        b.id,
      );
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    await updateCalendarEvent(bookingByToken(b.token), "move");
    if (b.start_utc !== start.toString()) notify({ kind: "rescheduled", previousStart: b.start_utc }, b.token);
    res.json(bookingView(bookingByToken(b.token)));
  });

  // ---------- Host dashboard ----------

  api.get("/me", (_req, res) => {
    res.json(ownerView());
  });

  api.put("/me", (req, res) => {
    const body = req.body ?? {};
    const slug = requireSlug(body.slug);
    const clash = db.prepare("SELECT id FROM hosts WHERE slug = ? AND id != ?").get(slug, HOST_ID);
    if (clash) throw new HttpError(409, "That URL is taken.");
    const current = getHost();
    const language = body.language ?? current.language;
    if (language !== "en" && language !== "sv") throw new HttpError(400, "Language must be en or sv.");
    const emailVia = body.email_via ?? current.email_via;
    if (emailVia !== "smtp" && emailVia !== "microsoft") throw new HttpError(400, "email_via must be smtp or microsoft.");
    db.prepare("UPDATE hosts SET name = ?, slug = ?, email = ?, timezone = ?, welcome = ?, language = ?, email_via = ? WHERE id = ?").run(
      requireText(body.name, "Name"),
      slug,
      requireEmail(body.email),
      parseTimezone(body.timezone),
      String(body.welcome ?? "").slice(0, 1000),
      language,
      emailVia,
      HOST_ID,
    );
    res.json(ownerView());
  });

  // ---------- Calendar connection (Google or Microsoft 365) ----------

  const pendingStates = new Map<string, { provider: CalendarProviderId; expires: number }>();
  const providerParam = (value: string) => {
    const id = PROVIDER_IDS.find((p) => p === value);
    if (!id) throw new HttpError(404, "Unknown calendar provider.");
    return providers[id];
  };

  api.get("/calendar/:provider/connect", (req, res) => {
    const provider = providerParam(req.params.provider);
    if (!provider.configured()) throw new HttpError(400, `${provider.id} is not configured on the server.`);
    const state = randomBytes(16).toString("hex");
    pendingStates.set(state, { provider: provider.id, expires: Date.now() + 10 * 60_000 });
    res.redirect(provider.authUrl(state));
  });

  api.get("/calendar/:provider/callback", async (req, res) => {
    const back = (params: Record<string, string>) => res.redirect(`/app/settings?${new URLSearchParams(params)}`);
    const provider = providerParam(req.params.provider);
    const state = String(req.query.state ?? "");
    const pending = pendingStates.get(state);
    pendingStates.delete(state);
    if (req.query.error) {
      return back({ calendar: "error", message: String(req.query.error_description ?? req.query.error) });
    }
    if (!pending || pending.provider !== provider.id || pending.expires < Date.now()) {
      return back({ calendar: "error", message: "The sign-in link expired. Please try again." });
    }
    try {
      const { refreshToken, email } = await provider.exchangeCode(String(req.query.code ?? ""));
      const previous = getHost();
      if (previous.calendar_refresh_token && previous.calendar_provider) {
        await providers[previous.calendar_provider].revoke(previous.calendar_refresh_token);
      }
      db.prepare("UPDATE hosts SET calendar_provider = ?, calendar_refresh_token = ?, calendar_email = ? WHERE id = ?").run(
        provider.id,
        refreshToken,
        email,
        HOST_ID,
      );
      back({ calendar: "connected", provider: provider.id });
    } catch (err) {
      back({ calendar: "error", message: (err as Error).message });
    }
  });

  api.post("/calendar/disconnect", async (_req, res) => {
    const host = getHost();
    if (host.calendar_refresh_token && host.calendar_provider) {
      await providers[host.calendar_provider].revoke(host.calendar_refresh_token);
    }
    db.prepare("UPDATE hosts SET calendar_provider = '', calendar_refresh_token = '', calendar_email = '' WHERE id = ?").run(HOST_ID);
    res.json(ownerView());
  });

  api.get("/event-types", (_req, res) => {
    res.json(db.prepare("SELECT * FROM event_types WHERE host_id = ? ORDER BY id").all(HOST_ID));
  });

  api.get("/event-types/:id", (req, res) => {
    res.json(ownEventType(req.params.id));
  });

  api.post("/event-types", (req, res) => {
    const v = parseEventType(req.body);
    assertSlugFree(v.slug, 0);
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO event_types (host_id, title, slug, description, duration, color, location_kind, location_detail,
           active, min_notice_minutes, buffer_minutes, max_days_ahead, slot_interval)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(HOST_ID, ...eventTypeValues(v));
    res.status(201).json(ownEventType(String(lastInsertRowid)));
  });

  api.put("/event-types/:id", (req, res) => {
    const existing = ownEventType(req.params.id);
    const v = parseEventType({ ...existing, ...req.body });
    assertSlugFree(v.slug, existing.id);
    db.prepare(
      `UPDATE event_types SET title = ?, slug = ?, description = ?, duration = ?, color = ?, location_kind = ?,
         location_detail = ?, active = ?, min_notice_minutes = ?, buffer_minutes = ?, max_days_ahead = ?, slot_interval = ?
       WHERE id = ?`,
    ).run(...eventTypeValues(v), existing.id);
    res.json(ownEventType(req.params.id));
  });

  api.delete("/event-types/:id", (req, res) => {
    const existing = ownEventType(req.params.id);
    db.prepare("DELETE FROM event_types WHERE id = ?").run(existing.id);
    res.status(204).end();
  });

  api.get("/availability", (_req, res) => {
    res.json({ timezone: getHost().timezone, rules: rulesFor(HOST_ID) });
  });

  api.put("/availability", (req, res) => {
    const rules = Array.isArray(req.body?.rules) ? req.body.rules : null;
    if (!rules) throw new HttpError(400, "rules must be an array.");
    const parsed = rules.map((r: Partial<AvailabilityRule>) => {
      const weekday = Number(r.weekday);
      const start = Number(r.start_minute);
      const end = Number(r.end_minute);
      if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw new HttpError(400, "Invalid weekday.");
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 24 * 60 || end <= start) {
        throw new HttpError(400, "Each time range must end after it starts.");
      }
      return { weekday, start, end };
    });
    db.exec("BEGIN");
    db.prepare("DELETE FROM availability_rules WHERE host_id = ?").run(HOST_ID);
    const insert = db.prepare("INSERT INTO availability_rules (host_id, weekday, start_minute, end_minute) VALUES (?, ?, ?, ?)");
    for (const r of parsed) insert.run(HOST_ID, r.weekday, r.start, r.end);
    if (req.body?.timezone) db.prepare("UPDATE hosts SET timezone = ? WHERE id = ?").run(parseTimezone(req.body.timezone), HOST_ID);
    db.exec("COMMIT");
    res.json({ timezone: getHost().timezone, rules: rulesFor(HOST_ID) });
  });

  api.get("/scheduled", (req, res) => {
    const view = String(req.query.view ?? "upcoming");
    const now = new Date().toISOString();
    const where =
      view === "past" ? "b.status = 'active' AND b.end_utc <= ?" : view === "cancelled" ? "b.status = 'cancelled' AND ? IS NOT NULL" : "b.status = 'active' AND b.end_utc > ?";
    const order = view === "upcoming" ? "ASC" : "DESC";
    const rows = db
      .prepare(
        `SELECT b.*, e.title AS event_title, e.color AS event_color, e.location_kind, e.location_detail
         FROM bookings b JOIN event_types e ON e.id = b.event_type_id
         WHERE e.host_id = ? AND ${where} ORDER BY b.start_utc ${order}`,
      )
      .all(HOST_ID, now);
    res.json(rows);
  });

  api.post("/scheduled/:id/cancel", async (req, res) => {
    const b = db
      .prepare("SELECT b.* FROM bookings b JOIN event_types e ON e.id = b.event_type_id WHERE b.id = ? AND e.host_id = ?")
      .get(Number(req.params.id), HOST_ID) as Booking | undefined;
    if (!b) throw new HttpError(404, "Booking not found.");
    await cancelBooking(b, String(req.body?.reason ?? ""), "host");
    res.json({ ok: true });
  });

  api.use((_req, _res, next) => next(new HttpError(404, "Not found.")));
  api.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
    } else {
      console.error(err);
      res.status(500).json({ error: "Something went wrong." });
    }
  });

  async function cancelBooking(b: Booking, reason: string, by: "invitee" | "host") {
    if (b.status === "cancelled") return;
    db.prepare("UPDATE bookings SET status = 'cancelled', cancel_reason = ?, sequence = sequence + 1 WHERE id = ?").run(
      reason.slice(0, 1000),
      b.id,
    );
    await updateCalendarEvent(b, "delete");
    notify({ kind: "cancelled", by, reason: reason.slice(0, 1000) }, b.token);
  }

  function ownEventType(id: string) {
    const et = db.prepare("SELECT * FROM event_types WHERE id = ? AND host_id = ?").get(Number(id), HOST_ID) as EventType | undefined;
    if (!et) throw new HttpError(404, "Event type not found.");
    return et;
  }

  function assertSlugFree(slug: string, exceptId: number) {
    const clash = db.prepare("SELECT id FROM event_types WHERE host_id = ? AND slug = ? AND id != ?").get(HOST_ID, slug, exceptId);
    if (clash) throw new HttpError(409, "Another event type already uses that URL.");
  }

  return api;
}

type EventTypeInput = Omit<EventType, "id" | "host_id">;

function parseEventType(body: Record<string, unknown> | undefined): EventTypeInput {
  const b = body ?? {};
  const kinds = ["online_meeting", "video", "phone", "in_person"] as const;
  const kind = kinds.find((k) => k === b.location_kind);
  if (!kind) throw new HttpError(400, "Choose a location.");
  const color = String(b.color ?? "");
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new HttpError(400, "Color must be a hex value like #8247f5.");
  return {
    title: requireText(b.title, "Event name"),
    slug: requireSlug(b.slug),
    description: String(b.description ?? "").slice(0, 2000),
    duration: intInRange(b.duration, "Duration", 5, 720),
    color,
    location_kind: kind,
    location_detail: String(b.location_detail ?? "").slice(0, 300),
    active: b.active === false || b.active === 0 ? 0 : 1,
    min_notice_minutes: intInRange(b.min_notice_minutes ?? 240, "Minimum notice", 0, 60 * 24 * 30),
    buffer_minutes: intInRange(b.buffer_minutes ?? 0, "Buffer", 0, 240),
    max_days_ahead: intInRange(b.max_days_ahead ?? 60, "Booking window", 1, 365),
    slot_interval: intInRange(b.slot_interval ?? 30, "Start time increment", 5, 240),
  };
}

function eventTypeValues(v: EventTypeInput) {
  return [
    v.title,
    v.slug,
    v.description,
    v.duration,
    v.color,
    v.location_kind,
    v.location_detail,
    v.active,
    v.min_notice_minutes,
    v.buffer_minutes,
    v.max_days_ahead,
    v.slot_interval,
  ] as const;
}

function publicHost(h: Host) {
  const meeting = h.calendar_refresh_token ? h.calendar_provider : "";
  return { name: h.name, slug: h.slug, timezone: h.timezone, welcome: h.welcome, language: h.language, meeting_provider: meeting };
}

function requireText(value: unknown, label: string) {
  const s = String(value ?? "").trim();
  if (!s) throw new HttpError(400, `${label} is required.`);
  return s.slice(0, 200);
}

function requireEmail(value: unknown) {
  const s = String(value ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new HttpError(400, "Enter a valid email address.");
  return s.slice(0, 200);
}

function requireSlug(value: unknown) {
  const s = String(value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(s)) throw new HttpError(400, "URLs may contain lowercase letters, numbers and dashes.");
  if (["api", "app", "booking", "assets"].includes(s)) throw new HttpError(400, "That URL is reserved.");
  return s;
}

function intInRange(value: unknown, label: string, min: number, max: number) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${label} must be between ${min} and ${max}.`);
  return n;
}

function parseTimezone(value: unknown) {
  const tz = String(value ?? "");
  try {
    Temporal.Now.zonedDateTimeISO(tz);
    return tz;
  } catch {
    throw new HttpError(400, "Unknown time zone.");
  }
}

function parseMonth(value: unknown) {
  try {
    return Temporal.PlainYearMonth.from(String(value ?? ""));
  } catch {
    throw new HttpError(400, "month must look like 2026-10.");
  }
}

function parseInstant(value: unknown) {
  try {
    return Temporal.Instant.from(String(value ?? ""));
  } catch {
    throw new HttpError(400, "Invalid start time.");
  }
}
