import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { api, LOCATION_LABEL, type BookingView } from "../../api.ts";
import { CalendarIcon, GlobeIcon, LocationIcon, UserIcon } from "../../components/Icons.tsx";
import { SlotPicker } from "../../components/SlotPicker.tsx";
import { formatRange, timezoneLabel } from "../../time.ts";
import { BookingShell, NotFound } from "./BookingShell.tsx";
import { EventInfo } from "./EventInfo.tsx";

type Mode = "view" | "cancel" | "reschedule";

/** Invitee's confirmation page; the secret token in the URL also allows cancel and reschedule. */
export function BookingPage() {
  const { token = "" } = useParams();
  const [view, setView] = useState<BookingView | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<Mode>("view");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [timezone, setTimezone] = useState("");

  useEffect(() => {
    api<BookingView>(`/bookings/${token}`).then((v) => {
      setView(v);
      setTimezone(v.booking.invitee_timezone);
    }, (e: Error) => setError(e.message));
  }, [token]);

  if (error && !view) return <NotFound title={error} />;
  if (!view) return <BookingShell><div className="center-msg">Loading…</div></BookingShell>;

  const { booking, eventType, host } = view;
  const cancelled = booking.status === "cancelled";
  const past = new Date(booking.end_utc) < new Date();

  async function act(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      setView(await api<BookingView>(`/bookings/${token}/${path}`, { body }));
      setMode("view");
    } catch (e) {
      setError((e as Error).message);
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
            <h2>Pick a new time</h2>
            <SlotPicker
              hostSlug={host.slug}
              eventSlug={eventType.slug}
              timezone={timezone}
              onTimezoneChange={setTimezone}
              excludeSlot={booking.start_utc}
              onConfirm={(start) => act("reschedule", { start })}
            />
            {error && <p className="error">{error}</p>}
            <div><button className="btn btn-outline" onClick={() => setMode("view")}>Keep current time</button></div>
          </section>
        </div>
      </BookingShell>
    );
  }

  return (
    <BookingShell>
      <div className="confirm">
        {cancelled ? (
          <h1>This meeting was cancelled</h1>
        ) : (
          <><span className="check">✓</span><h1>You are scheduled</h1></>
        )}
        <p className="sub">
          {cancelled ? booking.cancel_reason || "No reason was given." : `Keep this page's link — you can use it to reschedule or cancel.`}
        </p>
        <div className="details">
          <h2>{eventType.title}</h2>
          <p className="meta"><UserIcon />{host.name}</p>
          <p className="meta" style={cancelled ? { textDecoration: "line-through" } : undefined}>
            <CalendarIcon />{formatRange(booking.start_utc, booking.end_utc, booking.invitee_timezone)}
          </p>
          <p className="meta"><GlobeIcon />{timezoneLabel(booking.invitee_timezone)}</p>
          <p className="meta"><LocationIcon kind={eventType.location_kind} />{LOCATION_LABEL[eventType.location_kind]}</p>
        </div>

        {mode === "cancel" && (
          <div style={{ marginTop: 24, textAlign: "left" }}>
            <div className="field">
              <label htmlFor="reason">Reason for canceling</label>
              <textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            {error && <p className="error">{error}</p>}
            <div className="row">
              <button className="btn btn-danger" disabled={busy} onClick={() => act("cancel", { reason })}>Cancel event</button>
              <button className="btn btn-outline" onClick={() => setMode("view")}>Never mind</button>
            </div>
          </div>
        )}

        {mode === "view" && (
          <div className="links">
            {!cancelled && !past && (
              <>
                <button className="btn btn-outline" onClick={() => setMode("reschedule")}>Reschedule</button>
                <button className="btn btn-danger" onClick={() => setMode("cancel")}>Cancel</button>
              </>
            )}
            <Link className="btn btn-ghost" to={`/${host.slug}`}>Schedule another event</Link>
          </div>
        )}
      </div>
    </BookingShell>
  );
}
