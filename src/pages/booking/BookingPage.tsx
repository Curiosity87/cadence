import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { api, type BookingView } from "../../api.ts";
import { CalendarIcon, GlobeIcon, LocationIcon, UserIcon } from "../../components/Icons.tsx";
import { SlotPicker } from "../../components/SlotPicker.tsx";
import { locationLabel, useI18n } from "../../i18n.tsx";
import { formatRange, timezoneLabel } from "../../time.ts";
import { BookingShell, Loading, NotFound, errorTitle } from "./BookingShell.tsx";
import { EventInfo } from "./EventInfo.tsx";

type Mode = "view" | "cancel" | "reschedule";

/** Invitee's confirmation page; the secret token in the URL also allows cancel and reschedule. */
export function BookingPage() {
  const { token = "" } = useParams();
  const { t } = useI18n();
  const [view, setView] = useState<BookingView | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<Mode>("view");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [timezone, setTimezone] = useState("");

  useEffect(() => {
    api<BookingView>(`/bookings/${token}`).then(
      (v) => {
        setView(v);
        setTimezone(v.booking.invitee_timezone);
      },
      (e) => setError(errorTitle(e, t.common.notFound)),
    );
  }, [token, t]);

  if (error && !view) return <NotFound title={error} />;
  if (!view) return <Loading />;

  const { booking, eventType, host } = view;
  const cancelled = booking.status === "cancelled";
  const past = new Date(booking.end_utc) < new Date();
  const location = locationLabel(t, eventType.location_kind, host.meeting_provider);

  async function act(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      setView(await api<BookingView>(`/bookings/${token}/${path}`, { body }));
      setMode("view");
    } catch (e) {
      setError((e as { status?: number }).status === 409 ? t.booking.slotTaken : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (mode === "reschedule") {
    return (
      <BookingShell>
        <div className="booking-split">
          <EventInfo host={host} eventType={eventType} />
          <section className="booking-pick">
            <h2>{t.booking.pickNewTime}</h2>
            <SlotPicker
              hostSlug={host.slug}
              eventSlug={eventType.slug}
              timezone={timezone}
              onTimezoneChange={setTimezone}
              excludeSlot={booking.start_utc}
              onConfirm={(start) => act("reschedule", { start })}
            />
            {error && <p className="error">{error}</p>}
            <div><button className="btn btn-outline" onClick={() => setMode("view")}>{t.booking.keepTime}</button></div>
          </section>
        </div>
      </BookingShell>
    );
  }

  return (
    <BookingShell>
      <div className="confirm">
        {cancelled ? (
          <h1>{t.booking.cancelledTitle}</h1>
        ) : (
          <><span className="check">✓</span><h1>{t.booking.scheduled}</h1></>
        )}
        <p className="sub">
          {cancelled ? booking.cancel_reason || t.booking.noReason : view.emailed ? t.booking.emailed(booking.invitee_email) : t.booking.keepLink}
        </p>
        <div className="details">
          <h2>{eventType.title}</h2>
          <p className="meta"><UserIcon />{host.name}</p>
          <p className="meta" style={cancelled ? { textDecoration: "line-through" } : undefined}>
            <CalendarIcon />{formatRange(booking.start_utc, booking.end_utc, booking.invitee_timezone)}
          </p>
          <p className="meta"><GlobeIcon />{timezoneLabel(booking.invitee_timezone)}</p>
          <p className="meta"><LocationIcon kind={eventType.location_kind} />{location}</p>
          {booking.meeting_url && !cancelled && (
            <a className="btn btn-primary" href={booking.meeting_url} target="_blank" rel="noreferrer" style={{ marginTop: 8 }}>
              {t.booking.join(location)}
            </a>
          )}
        </div>

        {mode === "cancel" && (
          <div style={{ marginTop: 24, textAlign: "left" }}>
            <div className="field">
              <label htmlFor="reason">{t.booking.cancelReason}</label>
              <textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            {error && <p className="error">{error}</p>}
            <div className="row">
              <button className="btn btn-danger" disabled={busy} onClick={() => act("cancel", { reason })}>{t.booking.cancelEvent}</button>
              <button className="btn btn-outline" onClick={() => setMode("view")}>{t.booking.neverMind}</button>
            </div>
          </div>
        )}

        {mode === "view" && (
          <div className="links">
            {!cancelled && !past && (
              <>
                <button className="btn btn-outline" onClick={() => setMode("reschedule")}>{t.booking.reschedule}</button>
                <button className="btn btn-danger" onClick={() => setMode("cancel")}>{t.booking.cancelBooking}</button>
              </>
            )}
            <Link className="btn btn-ghost" to={`/${host.slug}`}>{t.booking.scheduleAnother}</Link>
          </div>
        )}
      </div>
    </BookingShell>
  );
}
