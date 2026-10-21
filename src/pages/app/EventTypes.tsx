import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api, LOCATION_LABEL, type EventType } from "../../api.ts";
import { durationLabel } from "../../time.ts";
import { useApp } from "./AppLayout.tsx";

export function EventTypes() {
  const { host, toast } = useApp();
  const [types, setTypes] = useState<EventType[] | null>(null);

  useEffect(() => {
    api<EventType[]>("/event-types").then(setTypes);
  }, []);

  const publicUrl = (path = "") => `${location.origin}/${host?.slug ?? ""}${path}`;
  const copy = async (path: string) => {
    await navigator.clipboard.writeText(publicUrl(path));
    toast("Link copied");
  };
  const toggle = async (et: EventType) => {
    const updated = await api<EventType>(`/event-types/${et.id}`, { method: "PUT", body: { active: et.active ? 0 : 1 } });
    setTypes((list) => list?.map((x) => (x.id === et.id ? updated : x)) ?? null);
  };

  return (
    <>
      <div className="page-head">
        <h1>Scheduling</h1>
        <Link to="/app/event-types/new" className="btn btn-primary">+ New event type</Link>
      </div>

      {host && (
        <div className="card share-bar">
          <div style={{ flex: 1, minWidth: 200 }}>
            <strong>{host.name}</strong>
            <div><a href={publicUrl()} target="_blank" rel="noreferrer">{publicUrl()}</a></div>
          </div>
          <button className="btn btn-outline" onClick={() => copy("")}>Copy link</button>
        </div>
      )}

      {types === null ? (
        <p className="muted">Loading…</p>
      ) : types.length === 0 ? (
        <div className="card empty">
          <p>You don't have any event types yet.</p>
          <p style={{ marginTop: 16 }}><Link to="/app/event-types/new" className="btn btn-primary">Create your first event type</Link></p>
        </div>
      ) : (
        <div className="et-grid">
          {types.map((et) => (
            <div key={et.id} className={`card et-card${et.active ? "" : " off"}`} style={{ borderTopColor: et.color }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h3>{et.title}</h3>
                <label className="switch" title={et.active ? "On" : "Off"}>
                  <input type="checkbox" checked={!!et.active} onChange={() => toggle(et)} aria-label="Active" />
                  <span />
                </label>
              </div>
              <p className="muted">{durationLabel(et.duration)}, One-on-One</p>
              <p className="muted" style={{ fontSize: 14 }}>{LOCATION_LABEL[et.location_kind]}</p>
              <a href={publicUrl(`/${et.slug}`)} target="_blank" rel="noreferrer" style={{ fontSize: 14 }}>View booking page</a>
              <div className="actions">
                <button className="btn btn-ghost" onClick={() => copy(`/${et.slug}`)}>Copy link</button>
                <Link className="btn btn-outline" to={`/app/event-types/${et.id}`}>Edit</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
