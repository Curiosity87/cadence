import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { api, type EventType, type Host } from "../../api.ts";
import { useI18n } from "../../i18n.tsx";
import { BookingShell, Loading, NotFound, errorTitle } from "./BookingShell.tsx";

export function HostPage() {
  const { host: hostSlug = "" } = useParams();
  const { t } = useI18n();
  const [data, setData] = useState<{ host: Host; eventTypes: EventType[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ host: Host; eventTypes: EventType[] }>(`/public/${hostSlug}`).then(setData, (e) => setError(errorTitle(e, t.common.notFound)));
  }, [hostSlug, t]);

  if (error) return <NotFound title={error} />;
  if (!data) return <Loading />;

  return (
    <BookingShell>
      <div className="host-page">
        <h1>{data.host.name}</h1>
        <p className="welcome">{data.host.welcome}</p>
        {data.eventTypes.length === 0 ? (
          <p className="muted">{t.booking.noEventTypes}</p>
        ) : (
          <div className="host-events">
            {data.eventTypes.map((et) => (
              <Link key={et.id} to={`/${data.host.slug}/${et.slug}`} className="host-event">
                <span className="dot" style={{ background: et.color }} />
                <strong>{et.title}</strong>
                <span className="arrow" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </BookingShell>
  );
}
