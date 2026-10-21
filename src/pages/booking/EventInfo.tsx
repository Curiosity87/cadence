import { Link } from "react-router";
import type { EventType, Host } from "../../api.ts";
import { CalendarIcon, ClockIcon, GlobeIcon, LocationIcon } from "../../components/Icons.tsx";
import { locationLabel, useI18n } from "../../i18n.tsx";
import { formatRange, timezoneLabel } from "../../time.ts";

type Props = {
  host: Host;
  eventType: EventType;
  backTo?: string;
  start?: string;
  timezone?: string;
};

/** Left column of the booking card: who, what, how long, where (and when, once chosen). */
export function EventInfo({ host, eventType, backTo, start, timezone }: Props) {
  const { t } = useI18n();
  const end = start ? new Date(new Date(start).getTime() + eventType.duration * 60_000).toISOString() : undefined;
  return (
    <aside className="booking-info">
      {backTo && (
        <Link to={backTo} className="back" aria-label={t.common.back}>←</Link>
      )}
      <p className="host-name">{host.name}</p>
      <h1>{eventType.title}</h1>
      <p className="meta"><ClockIcon />{t.duration(eventType.duration)}</p>
      <p className="meta">
        <LocationIcon kind={eventType.location_kind} />
        <span>
          {locationLabel(t, eventType.location_kind, host.meeting_provider)}
          {eventType.location_detail && eventType.location_kind !== "online_meeting" && (
            <><br /><span style={{ fontWeight: 400 }}>{eventType.location_detail}</span></>
          )}
        </span>
      </p>
      {start && end && timezone && (
        <>
          <p className="meta"><CalendarIcon />{formatRange(start, end, timezone)}</p>
          <p className="meta"><GlobeIcon />{timezoneLabel(timezone)}</p>
        </>
      )}
      {eventType.description && <p className="desc">{eventType.description}</p>}
    </aside>
  );
}
