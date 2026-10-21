import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { api, type BookingView, type EventType, type Host } from "../../api.ts";
import { SlotPicker } from "../../components/SlotPicker.tsx";
import { useI18n } from "../../i18n.tsx";
import { browserTimezone } from "../../time.ts";
import { BookingShell, Loading, NotFound, errorTitle } from "./BookingShell.tsx";
import { EventInfo } from "./EventInfo.tsx";

export function EventPage() {
  const { host: hostSlug = "", event: eventSlug = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [data, setData] = useState<{ host: Host; eventType: EventType } | null>(null);
  const [error, setError] = useState("");
  const [timezone, setTimezone] = useState(params.get("tz") ?? browserTimezone());
  const start = params.get("start");

  useEffect(() => {
    api<{ host: Host; eventType: EventType }>(`/public/${hostSlug}/${eventSlug}`).then(setData, (e) => setError(errorTitle(e, t.common.notFound)));
  }, [hostSlug, eventSlug, t]);

  if (error) return <NotFound title={error} />;
  if (!data) return <Loading />;

  const base = `/${hostSlug}/${eventSlug}`;
  return (
    <BookingShell>
      <div className="booking-split">
        <EventInfo
          host={data.host}
          eventType={data.eventType}
          backTo={start ? `${base}?tz=${encodeURIComponent(timezone)}` : `/${hostSlug}`}
          start={start ?? undefined}
          timezone={timezone}
        />
        {start ? (
          <DetailsForm
            hostSlug={hostSlug}
            eventSlug={eventSlug}
            start={start}
            timezone={timezone}
            onBooked={(token) => navigate(`/booking/${token}`)}
            onTaken={() => setParams({ tz: timezone })}
          />
        ) : (
          <section className="booking-pick">
            <h2>{t.booking.selectDateTime}</h2>
            <SlotPicker
              hostSlug={hostSlug}
              eventSlug={eventSlug}
              timezone={timezone}
              onTimezoneChange={setTimezone}
              onConfirm={(s) => setParams({ start: s, tz: timezone })}
            />
          </section>
        )}
      </div>
    </BookingShell>
  );
}

type FormProps = {
  hostSlug: string;
  eventSlug: string;
  start: string;
  timezone: string;
  onBooked: (token: string) => void;
  onTaken: () => void;
};

function DetailsForm({ hostSlug, eventSlug, start, timezone, onBooked, onTaken }: FormProps) {
  const { t } = useI18n();
  const [form, setForm] = useState({ name: "", email: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<BookingView>(`/public/${hostSlug}/${eventSlug}/book`, { body: { ...form, start, timezone } });
      onBooked(r.booking.token);
    } catch (err) {
      const taken = (err as { status?: number }).status === 409;
      setError(taken ? t.booking.slotTaken : (err as Error).message);
      setBusy(false);
      if (taken) setTimeout(onTaken, 1800);
    }
  }

  return (
    <form className="booking-form" onSubmit={submit}>
      <h2>{t.booking.enterDetails}</h2>
      <div className="field">
        <label htmlFor="name">{t.booking.name} *</label>
        <input id="name" required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="email">{t.booking.email} *</label>
        <input id="email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="notes">{t.booking.notes}</label>
        <textarea id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? t.booking.scheduling : t.booking.schedule}</button>
    </form>
  );
}
