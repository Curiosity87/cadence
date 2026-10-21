import { useEffect, useState } from "react";
import { api, type AvailabilityRule } from "../../api.ts";
import { allTimezones, hhmmToMinutes, minutesToHHMM, timezoneLabel } from "../../time.ts";
import { getLocale, useI18n } from "../../i18n.tsx";
import { useApp } from "./AppLayout.tsx";

// 2024-01-01 was a Monday; used only to get localized weekday names.
const weekdayName = (weekday: number) => new Date(2024, 0, weekday).toLocaleDateString(getLocale(), { weekday: "long" });

export function Availability() {
  const { toast, setHost, host } = useApp();
  const { t } = useI18n();
  const [timezone, setTimezone] = useState("");
  const [rules, setRules] = useState<AvailabilityRule[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ timezone: string; rules: AvailabilityRule[] }>("/availability").then((r) => {
      setTimezone(r.timezone);
      setRules(r.rules);
    });
  }, []);

  if (!rules) return <p className="muted">{t.common.loading}</p>;

  const forDay = (weekday: number) => rules.map((r, i) => ({ r, i })).filter(({ r }) => r.weekday === weekday);
  const update = (i: number, patch: Partial<AvailabilityRule>) => setRules(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => setRules(rules.filter((_, j) => j !== i));
  const add = (weekday: number) => {
    const existing = forDay(weekday).map(({ r }) => r);
    const last = existing.at(-1);
    const start = last ? Math.min(last.end_minute + 60, 23 * 60) : 9 * 60;
    setRules([...rules, { weekday, start_minute: start, end_minute: Math.min(start + (last ? 60 : 8 * 60), 24 * 60 - 1) }]);
  };

  async function save() {
    setError("");
    try {
      const r = await api<{ timezone: string; rules: AvailabilityRule[] }>("/availability", { method: "PUT", body: { timezone, rules } });
      setRules(r.rules);
      if (host) setHost({ ...host, timezone: r.timezone });
      toast(t.availability.saved);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="page-head">
        <h1>{t.availability.title}</h1>
        <button className="btn btn-primary" onClick={save}>{t.common.save}</button>
      </div>
      <div className="card" style={{ padding: "20px 24px", marginBottom: 20 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="tz">{t.common.timeZone}</label>
          <select id="tz" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {allTimezones().map((tz) => <option key={tz} value={tz}>{timezoneLabel(tz)}</option>)}
          </select>
          <span className="hint">{t.availability.tzHint}</span>
        </div>
      </div>
      <div className="card">
        <div className="list-day">{t.availability.weeklyHours}</div>
        {[1, 2, 3, 4, 5, 6, 7].map((weekday) => {
          const name = weekdayName(weekday);
          const ranges = forDay(weekday);
          return (
            <div className="avail-row" key={weekday}>
              <div className="avail-day">
                <input
                  type="checkbox"
                  checked={ranges.length > 0}
                  aria-label={t.availability.available(name)}
                  onChange={(e) => (e.target.checked ? add(weekday) : setRules(rules.filter((r) => r.weekday !== weekday)))}
                />
                {t.booking.dow[weekday - 1]}
              </div>
              <div className="avail-ranges">
                {ranges.length === 0 && <span className="muted" style={{ paddingTop: 8 }}>{t.availability.unavailable}</span>}
                {ranges.map(({ r, i }) => (
                  <div className="avail-range" key={i}>
                    <input className="input" type="time" value={minutesToHHMM(r.start_minute)} onChange={(e) => update(i, { start_minute: hhmmToMinutes(e.target.value) })} />
                    –
                    <input className="input" type="time" value={minutesToHHMM(r.end_minute)} onChange={(e) => update(i, { end_minute: hhmmToMinutes(e.target.value) })} />
                    <button className="icon-btn" onClick={() => remove(i)} aria-label={t.availability.removeRange}>✕</button>
                  </div>
                ))}
                {ranges.length > 0 && (
                  <div><button className="btn btn-ghost" onClick={() => add(weekday)}>{t.availability.addHours}</button></div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
