import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api, type EventType } from "../../api.ts";
import { locationLabel, useI18n } from "../../i18n.tsx";
import { useApp } from "./AppLayout.tsx";

export function EventTypes() {
  const { host, toast } = useApp();
  const { t } = useI18n();
  const [types, setTypes] = useState<EventType[] | null>(null);

  useEffect(() => {
    api<EventType[]>("/event-types").then(setTypes);
  }, []);

  const publicUrl = (path = "") => `${location.origin}/${host?.slug ?? ""}${path}`;
  const copy = async (path: string) => {
    await navigator.clipboard.writeText(publicUrl(path));
    toast(t.common.linkCopied);
  };
  const toggle = async (et: EventType) => {
    const updated = await api<EventType>(`/event-types/${et.id}`, { method: "PUT", body: { active: et.active ? 0 : 1 } });
    setTypes((list) => list?.map((x) => (x.id === et.id ? updated : x)) ?? null);
  };

  return (
    <>
      <div className="page-head">
        <h1>{t.eventTypes.title}</h1>
        <Link to="/app/event-types/new" className="btn btn-primary">{t.eventTypes.newEventType}</Link>
      </div>

      {host && (
        <div className="card share-bar">
          <div style={{ flex: 1, minWidth: 200 }}>
            <strong>{host.name}</strong>
            <div><a href={publicUrl()} target="_blank" rel="noreferrer">{publicUrl()}</a></div>
          </div>
          <button className="btn btn-outline" onClick={() => copy("")}>{t.common.copyLink}</button>
        </div>
      )}

      {types === null ? (
        <p className="muted">{t.common.loading}</p>
      ) : types.length === 0 ? (
        <div className="card empty">
          <p>{t.eventTypes.empty}</p>
          <p style={{ marginTop: 16 }}><Link to="/app/event-types/new" className="btn btn-primary">{t.eventTypes.createFirst}</Link></p>
        </div>
      ) : (
        <div className="et-grid">
          {types.map((et) => (
            <div key={et.id} className={`card et-card${et.active ? "" : " off"}`} style={{ borderTopColor: et.color }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h3>{et.title}</h3>
                <label className="switch" title={et.active ? t.eventTypes.on : t.eventTypes.off}>
                  <input type="checkbox" checked={!!et.active} onChange={() => toggle(et)} aria-label={t.eventTypes.active} />
                  <span />
                </label>
              </div>
              <p className="muted">{t.duration(et.duration)}, {t.eventTypes.oneOnOne}</p>
              <p className="muted" style={{ fontSize: 14 }}>{locationLabel(t, et.location_kind, host?.calendar_provider)}</p>
              <a href={publicUrl(`/${et.slug}`)} target="_blank" rel="noreferrer" style={{ fontSize: 14 }}>{t.eventTypes.viewBookingPage}</a>
              <div className="actions">
                <button className="btn btn-ghost" onClick={() => copy(`/${et.slug}`)}>{t.common.copyLink}</button>
                <Link className="btn btn-outline" to={`/app/event-types/${et.id}`}>{t.common.edit}</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
