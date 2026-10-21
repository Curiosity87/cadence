import { Fragment, useEffect, useState } from "react";
import { api, LOCATION_LABEL, type ScheduledRow } from "../../api.ts";
import { formatLongDate, formatTime } from "../../time.ts";
import { useApp } from "./AppLayout.tsx";

type View = "upcoming" | "past" | "cancelled";

export function Meetings() {
  const { host, toast } = useApp();
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
    const reason = prompt(`Cancel ${row.event_title} with ${row.invitee_name}? Optional reason:`);
    if (reason === null) return;
    await api(`/scheduled/${row.id}/cancel`, { body: { reason } });
    setRows((r) => r?.filter((x) => x.id !== row.id) ?? null);
    toast("Meeting cancelled");
  }

  let lastDay = "";
  return (
    <>
      <div className="page-head"><h1>Meetings</h1></div>
      <div className="tabs" role="tablist">
        {(["upcoming", "past", "cancelled"] as View[]).map((v) => (
          <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}>
            {v[0].toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>
      <div className="card">
        {rows === null ? (
          <div className="empty">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="empty">No {view} meetings.</div>
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
                    <div className="muted">Event type <strong>{row.event_title}</strong></div>
                    {open === row.id && (
                      <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.7 }}>
                        <div><span className="muted">Email:</span> <a href={`mailto:${row.invitee_email}`}>{row.invitee_email}</a></div>
                        <div><span className="muted">Location:</span> {LOCATION_LABEL[row.location_kind]} {row.location_detail}</div>
                        <div><span className="muted">Invitee time zone:</span> {row.invitee_timezone}</div>
                        {row.notes && <div><span className="muted">Notes:</span> {row.notes}</div>}
                        {row.cancel_reason && <div><span className="muted">Cancel reason:</span> {row.cancel_reason}</div>}
                        <div><span className="muted">Booked:</span> {formatLongDate(row.created_at, tz)}</div>
                      </div>
                    )}
                  </div>
                  <div className="row">
                    {view === "upcoming" && <button className="btn btn-danger" onClick={() => cancel(row)}>Cancel</button>}
                    <button className="btn btn-ghost" onClick={() => setOpen(open === row.id ? null : row.id)}>
                      {open === row.id ? "Hide" : "Details"}
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
