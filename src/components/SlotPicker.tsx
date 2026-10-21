import { useEffect, useMemo, useState } from "react";
import { api } from "../api.ts";
import { useI18n } from "../i18n.tsx";
import { allTimezones, formatDay, formatMonth, formatTime, monthKey, timezoneLabel } from "../time.ts";

type Props = {
  hostSlug: string;
  eventSlug: string;
  timezone: string;
  onTimezoneChange: (tz: string) => void;
  onConfirm: (startIso: string) => void;
  /** Excluded from availability, e.g. the slot currently held by a booking being rescheduled. */
  excludeSlot?: string;
};

/** Month calendar of bookable days, plus the list of start times for the chosen day. */
export function SlotPicker({ hostSlug, eventSlug, timezone, onTimezoneChange, onConfirm, excludeSlot }: Props) {
  const { t } = useI18n();
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [days, setDays] = useState<Record<string, string[]> | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [hour12, setHour12] = useState(false);
  const [error, setError] = useState("");

  const key = monthKey(cursor.year, cursor.month);
  useEffect(() => {
    let cancelled = false;
    setDays(null);
    api<{ days: Record<string, string[]> }>(`/public/${hostSlug}/${eventSlug}/slots?month=${key}&tz=${encodeURIComponent(timezone)}`)
      .then((r) => {
        if (cancelled) return;
        const filtered = Object.fromEntries(
          Object.entries(r.days).map(([d, slots]) => [d, slots.filter((s) => s !== excludeSlot)]).filter(([, s]) => s.length),
        );
        setDays(filtered);
        setSelectedDate((current) => (current && filtered[current] ? current : null));
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [hostSlug, eventSlug, key, timezone, excludeSlot]);

  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const lead = (first.getDay() + 6) % 7; // Monday-first grid
    const count = new Date(cursor.year, cursor.month + 1, 0).getDate();
    return [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)] as (number | null)[];
  }, [cursor]);

  const isCurrentMonth = cursor.year === today.getFullYear() && cursor.month === today.getMonth();
  const monthName = formatMonth(cursor.year, cursor.month);
  const shift = (delta: number) => {
    const d = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
    setChosen(null);
  };
  const slots = selectedDate && days ? days[selectedDate] ?? [] : [];

  return (
    <>
      <div>
        <div className="cal-head">
          <button className="cal-nav" onClick={() => shift(-1)} disabled={isCurrentMonth} aria-label={t.booking.prevMonth}>‹</button>
          <span>{monthName}</span>
          <button className="cal-nav" onClick={() => shift(1)} aria-label={t.booking.nextMonth}>›</button>
        </div>
        <div className="cal-grid" role="grid" aria-busy={days === null}>
          {t.booking.dow.map((d) => (
            <div key={d} className="cal-dow">{d}</div>
          ))}
          {cells.map((day, i) => {
            if (day === null) return <div key={`e${i}`} />;
            const iso = `${key}-${String(day).padStart(2, "0")}`;
            const available = !!days?.[iso];
            const isToday = isCurrentMonth && day === today.getDate();
            const cls = ["cal-day", available && "available", selectedDate === iso && "selected", isToday && "today"].filter(Boolean).join(" ");
            return (
              <button
                key={iso}
                className={cls}
                disabled={!available}
                aria-label={`${iso}${available ? `, ${t.booking.timesAvailable}` : ""}`}
                onClick={() => {
                  setSelectedDate(iso);
                  setChosen(null);
                }}
              >
                {day}
              </button>
            );
          })}
        </div>
        {days && Object.keys(days).length === 0 && <p className="muted" style={{ textAlign: "center", marginTop: 16 }}>{t.booking.noTimes}</p>}
        {error && <p className="error">{error}</p>}
        <div className="tz">
          <label htmlFor="tz">{t.common.timeZone}</label>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <select id="tz" value={timezone} onChange={(e) => onTimezoneChange(e.target.value)}>
              {allTimezones().map((tz) => (
                <option key={tz} value={tz}>{timezoneLabel(tz)}</option>
              ))}
            </select>
            <button className="btn-ghost btn" onClick={() => setHour12((v) => !v)} style={{ fontSize: 13 }}>
              {hour12 ? "am/pm" : "24h"}
            </button>
          </div>
        </div>
      </div>

      {selectedDate && (
        <div className="slots">
          <h3>
            {formatDay(selectedDate)}
          </h3>
          {slots.map((s) =>
            chosen === s ? (
              <div className="slot-row" key={s}>
                <button className="slot chosen">{formatTime(s, timezone, hour12)}</button>
                <button className="slot-next" onClick={() => onConfirm(s)}>{t.booking.next}</button>
              </div>
            ) : (
              <button className="slot" key={s} onClick={() => setChosen(s)}>{formatTime(s, timezone, hour12)}</button>
            ),
          )}
        </div>
      )}
    </>
  );
}
