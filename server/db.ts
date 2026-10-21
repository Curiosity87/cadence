import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

export type Host = {
  id: number;
  name: string;
  slug: string;
  email: string;
  timezone: string;
  welcome: string;
};

export type LocationKind = "video" | "phone" | "in_person";

export type EventType = {
  id: number;
  host_id: number;
  title: string;
  slug: string;
  description: string;
  duration: number;
  color: string;
  location_kind: LocationKind;
  location_detail: string;
  active: number;
  min_notice_minutes: number;
  buffer_minutes: number;
  max_days_ahead: number;
  slot_interval: number;
};

/** Weekly recurring window in the host's time zone. weekday: 1 = Monday ... 7 = Sunday (ISO). */
export type AvailabilityRule = {
  id: number;
  host_id: number;
  weekday: number;
  start_minute: number;
  end_minute: number;
};

export type Booking = {
  id: number;
  token: string;
  event_type_id: number;
  start_utc: string;
  end_utc: string;
  invitee_name: string;
  invitee_email: string;
  invitee_timezone: string;
  notes: string;
  status: "active" | "cancelled";
  cancel_reason: string;
  created_at: string;
};

export function openDatabase(file = process.env.DB_PATH ?? "data/cadence.db"): DatabaseSync {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS hosts (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      timezone TEXT NOT NULL,
      welcome TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS event_types (
      id INTEGER PRIMARY KEY,
      host_id INTEGER NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      duration INTEGER NOT NULL,
      color TEXT NOT NULL,
      location_kind TEXT NOT NULL DEFAULT 'video',
      location_detail TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      min_notice_minutes INTEGER NOT NULL DEFAULT 240,
      buffer_minutes INTEGER NOT NULL DEFAULT 0,
      max_days_ahead INTEGER NOT NULL DEFAULT 60,
      slot_interval INTEGER NOT NULL DEFAULT 30,
      UNIQUE (host_id, slug)
    );

    CREATE TABLE IF NOT EXISTS availability_rules (
      id INTEGER PRIMARY KEY,
      host_id INTEGER NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
      weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
      start_minute INTEGER NOT NULL,
      end_minute INTEGER NOT NULL CHECK (end_minute > start_minute)
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      event_type_id INTEGER NOT NULL REFERENCES event_types(id) ON DELETE CASCADE,
      start_utc TEXT NOT NULL,
      end_utc TEXT NOT NULL,
      invitee_name TEXT NOT NULL,
      invitee_email TEXT NOT NULL,
      invitee_timezone TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      cancel_reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS bookings_start ON bookings (start_utc);
  `);
  seed(db);
  return db;
}

function seed(db: DatabaseSync) {
  const existing = db.prepare("SELECT COUNT(*) AS n FROM hosts").get() as { n: number };
  if (existing.n > 0) return;

  db.prepare(
    "INSERT INTO hosts (id, name, slug, email, timezone, welcome) VALUES (1, ?, ?, ?, ?, ?)",
  ).run(
    "Kim Lidberg",
    "kim",
    "kim@example.com",
    "Europe/Stockholm",
    "Welcome to my scheduling page. Pick an event type below to add a meeting to my calendar.",
  );

  const insertEvent = db.prepare(`
    INSERT INTO event_types (host_id, title, slug, description, duration, color, location_kind, location_detail)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertEvent.run("15 Minute Meeting", "15min", "A quick intro call.", 15, "#f5c518", "video", "Video link sent after booking");
  insertEvent.run("30 Minute Meeting", "30min", "Let's talk through your project.", 30, "#8247f5", "video", "Video link sent after booking");
  insertEvent.run("60 Minute Consultation", "60min", "An in-depth working session.", 60, "#0ae8f0", "phone", "I'll call the number you provide");

  const insertRule = db.prepare(
    "INSERT INTO availability_rules (host_id, weekday, start_minute, end_minute) VALUES (1, ?, ?, ?)",
  );
  for (let weekday = 1; weekday <= 5; weekday++) insertRule.run(weekday, 9 * 60, 17 * 60);
}
