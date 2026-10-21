import { Fragment, useEffect, useState } from "react";
import { api, type ScheduledRow } from "../../api.ts";
import { locationLabel, useI18n } from "../../i18n.tsx";
import { formatLongDate, formatTime } from "../../time.ts";
import { useApp } from "./AppLayout.tsx";

type View = "upcoming" | "past" | "cancelled";

export function Meetings() {
  const { host, toast } = useApp();
  const { t } = useI18n();
  const m = t.meetings;
  const [view, setView] = useState<View>("upcoming");
  const [rows, setRows] = useState<ScheduledRow[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    setRows(null);
    api<ScheduledRow[]>(`/scheduled?view=${view}`).then(setRows);
  }, [view]);

  if (!host) return null;
  const tz = host.timezone;

  async function cancel(row: ScheduledRow) {
    const reason = prompt(m.confirmCancel(row.event_title, row.invitee_name));
    if (reason === null) return;
    await api(`/scheduled/${row.id}/cancel`, { body: { reason } });
    setRows((r) => r?.filter((x) => x.id !== row.id) ?? null);
    toast(m.cancelled);
  }

  let lastDay = "";
  return (
    <>
      <div className="page-head"><h1>{m.title}</h1></div>
      <div className="tabs" role="tablist">
        {(["upcoming", "past", "cancelled"] as View[]).map((v) => (
          <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}>
            {m.tabs[v]}
          </button>
        ))}
      </div>
      <div className="card">
        {rows === null ? (
          <div className="empty">{t.common.loading}</div>
        ) : rows.length === 0 ? (
          <div className="empty">{m.empty[view]}</div>
        ) : (
          rows.map((row) => {
            const day = formatLongDate(row.start_utc, tz);
            const header = day !== lastDay ? <div className="list-day">{day}</div> : null;
            lastDay = day;
            return (
              <Fragment key={row.id}>
                {header}
                <div className="list-row">
                  <div className="row">
                    <span className="dot" style={{ background: row.event_color }} />
                    <span>{formatTime(row.start_utc, tz)} – {formatTime(row.end_utc, tz)}</span>
                  </div>
                  <div>
                    <strong>{row.invitee_name}</strong>
                    <div className="muted">{m.eventType} <strong>{row.event_title}</strong></div>
                    {open === row.id && (
                      <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.7 }}>
                        <div><span className="muted">{m.email}:</span> <a href={`mailto:${row.invitee_email}`}>{row.invitee_email}</a></div>
                        <div><span className="muted">{m.location}:</span> {locationLabel(t, row.location_kind, host.calendar_provider)} {row.location_kind !== "online_meeting" && row.location_detail}</div>
                        {row.meeting_url && <div><span className="muted">{m.meetingLink}:</span> <a href={row.meeting_url} target="_blank" rel="noreferrer">{row.meeting_url}</a></div>}
                        <div><span className="muted">{m.inviteeTz}:</span> {row.invitee_timezone}</div>
                        {row.notes && <div><span className="muted">{m.notes}:</span> {row.notes}</div>}
                        {row.cancel_reason && <div><span className="muted">{m.cancelReason}:</span> {row.cancel_reason}</div>}
                        <div><span className="muted">{m.booked}:</span> {formatLongDate(row.created_at, tz)}</div>
                      </div>
                    )}
                  </div>
                  <div className="row">
                    {view === "upcoming" && <button className="btn btn-danger" onClick={() => cancel(row)}>{t.booking.cancelBooking}</button>}
                    <button className="btn btn-ghost" onClick={() => setOpen(open === row.id ? null : row.id)}>
                      {open === row.id ? m.hide : m.details}
                    </button>
                  </div>
                </div>
              </Fragment>
            );
          })
        )}
      </div>
    </>
  );
}
