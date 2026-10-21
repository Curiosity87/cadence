import type { AvailabilityRule, EventType } from "./db.ts";

export type BusyInterval = { start_utc: string; end_utc: string };

export type SlotQuery = {
  eventType: EventType;
  hostTimezone: string;
  rules: AvailabilityRule[];
  busy: BusyInterval[];
  /** Inclusive range of calendar dates, as seen by the invitee. */
  from: Temporal.PlainDate;
  to: Temporal.PlainDate;
  inviteeTimezone: string;
  now?: Temporal.Instant;
};

/**
 * Bookable start times grouped by the invitee's local date (YYYY-MM-DD → ISO instants).
 *
 * Availability rules live in the host's time zone, so we walk host-local dates one day
 * beyond each end of the requested range: a slot on the host's Monday can land on the
 * invitee's Sunday or Tuesday.
 */
export function availableSlots(q: SlotQuery): Record<string, string[]> {
  const now = q.now ?? Temporal.Now.instant();
  const et = q.eventType;
  const earliest = now.add({ minutes: et.min_notice_minutes });
  const latest = now.add({ hours: 24 * et.max_days_ahead });
  const busy = q.busy.map((b) => ({
    start: Temporal.Instant.from(b.start_utc).subtract({ minutes: et.buffer_minutes }),
    end: Temporal.Instant.from(b.end_utc).add({ minutes: et.buffer_minutes }),
  }));

  const byWeekday = new Map<number, AvailabilityRule[]>();
  for (const rule of q.rules) {
    byWeekday.set(rule.weekday, [...(byWeekday.get(rule.weekday) ?? []), rule]);
  }

  const result: Record<string, string[]> = {};
  const lastHostDate = q.to.add({ days: 1 });
  for (let date = q.from.subtract({ days: 1 }); Temporal.PlainDate.compare(date, lastHostDate) <= 0; date = date.add({ days: 1 })) {
    for (const rule of byWeekday.get(date.dayOfWeek) ?? []) {
      for (let minute = rule.start_minute; minute + et.duration <= rule.end_minute; minute += et.slot_interval) {
        const start = date
          .toZonedDateTime({ timeZone: q.hostTimezone, plainTime: minuteToTime(minute) })
          .toInstant();
        const end = start.add({ minutes: et.duration });
        if (Temporal.Instant.compare(start, earliest) < 0) continue;
        if (Temporal.Instant.compare(start, latest) > 0) continue;
        if (busy.some((b) => overlaps(start, end, b.start, b.end))) continue;

        const local = start.toZonedDateTimeISO(q.inviteeTimezone).toPlainDate();
        if (Temporal.PlainDate.compare(local, q.from) < 0 || Temporal.PlainDate.compare(local, q.to) > 0) continue;
        (result[local.toString()] ??= []).push(start.toString());
      }
    }
  }

  for (const day of Object.values(result)) day.sort((a, b) => Temporal.Instant.compare(a, b));
  return result;
}

export function isSlotAvailable(q: Omit<SlotQuery, "from" | "to">, startIso: string): boolean {
  const date = Temporal.Instant.from(startIso).toZonedDateTimeISO(q.inviteeTimezone).toPlainDate();
  return (availableSlots({ ...q, from: date, to: date })[date.toString()] ?? []).includes(
    Temporal.Instant.from(startIso).toString(),
  );
}

function minuteToTime(minute: number): Temporal.PlainTime {
  return new Temporal.PlainTime(Math.floor(minute / 60), minute % 60);
}

function overlaps(aStart: Temporal.Instant, aEnd: Temporal.Instant, bStart: Temporal.Instant, bEnd: Temporal.Instant) {
  return Temporal.Instant.compare(aStart, bEnd) < 0 && Temporal.Instant.compare(bStart, aEnd) < 0;
}
