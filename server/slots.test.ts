import { test } from "node:test";
import assert from "node:assert/strict";
import type { AvailabilityRule, EventType } from "./db.ts";
import { availableSlots, isSlotAvailable } from "./slots.ts";

const eventType: EventType = {
  id: 1,
  host_id: 1,
  title: "30 Minute Meeting",
  slug: "30min",
  description: "",
  duration: 30,
  color: "#8247f5",
  location_kind: "video",
  location_detail: "",
  active: 1,
  min_notice_minutes: 0,
  buffer_minutes: 0,
  max_days_ahead: 365,
  slot_interval: 30,
};

// Monday 09:00–11:00 in Stockholm.
const rules: AvailabilityRule[] = [{ id: 1, host_id: 1, weekday: 1, start_minute: 540, end_minute: 660 }];
const now = Temporal.Instant.from("2026-11-01T00:00:00Z");
const monday = Temporal.PlainDate.from("2026-11-02");
const base = { eventType, hostTimezone: "Europe/Stockholm", rules, busy: [], now };

test("generates slots in the host's zone and groups them by invitee date", () => {
  const days = availableSlots({ ...base, from: monday, to: monday, inviteeTimezone: "Europe/Stockholm" });
  assert.deepEqual(days["2026-11-02"], [
    "2026-11-02T08:00:00Z",
    "2026-11-02T08:30:00Z",
    "2026-11-02T09:00:00Z",
    "2026-11-02T09:30:00Z",
  ]);
});

test("slots can fall on a different calendar date for a far-away invitee", () => {
  const sunday = monday.subtract({ days: 1 });
  // Monday 09:00 in Stockholm is Sunday 22:00 in Honolulu.
  const days = availableSlots({ ...base, from: sunday, to: monday, inviteeTimezone: "Pacific/Honolulu" });
  assert.equal(days["2026-11-02"], undefined);
  assert.equal(days["2026-11-01"]?.[0], "2026-11-02T08:00:00Z");
});

test("existing bookings and their buffers block overlapping slots", () => {
  const busy = [{ start_utc: "2026-11-02T08:30:00Z", end_utc: "2026-11-02T09:00:00Z" }];
  const days = availableSlots({
    ...base,
    eventType: { ...eventType, buffer_minutes: 15 },
    busy,
    from: monday,
    to: monday,
    inviteeTimezone: "UTC",
  });
  assert.deepEqual(days["2026-11-02"], ["2026-11-02T09:30:00Z"]);
});

test("minimum notice hides slots that start too soon", () => {
  const days = availableSlots({
    ...base,
    now: Temporal.Instant.from("2026-11-02T07:00:00Z"),
    eventType: { ...eventType, min_notice_minutes: 120 },
    from: monday,
    to: monday,
    inviteeTimezone: "UTC",
  });
  assert.deepEqual(days["2026-11-02"], ["2026-11-02T09:00:00Z", "2026-11-02T09:30:00Z"]);
});

test("daylight saving shift keeps local wall-clock hours", () => {
  // 2026-03-30 is the Monday after Europe switches to summer time (UTC+2).
  const day = Temporal.PlainDate.from("2026-03-30");
  const days = availableSlots({ ...base, now: Temporal.Instant.from("2026-03-01T00:00:00Z"), from: day, to: day, inviteeTimezone: "UTC" });
  assert.equal(days["2026-03-30"]?.[0], "2026-03-30T07:00:00Z");
});

test("isSlotAvailable rejects times outside availability", () => {
  assert.equal(isSlotAvailable({ ...base, inviteeTimezone: "UTC" }, "2026-11-02T08:00:00Z"), true);
  assert.equal(isSlotAvailable({ ...base, inviteeTimezone: "UTC" }, "2026-11-02T08:15:00Z"), false);
  assert.equal(isSlotAvailable({ ...base, inviteeTimezone: "UTC" }, "2026-11-02T10:00:00Z"), false);
});
