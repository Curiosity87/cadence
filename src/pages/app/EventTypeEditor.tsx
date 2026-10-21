import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, type EventType, type LocationKind } from "../../api.ts";
import { useI18n } from "../../i18n.tsx";
import { useApp } from "./AppLayout.tsx";

const COLORS = ["#f5c518", "#ff4f00", "#e55cff", "#8247f5", "#0099ff", "#0ae8f0", "#17e885", "#ccf000", "#ffa600"];

type Draft = Omit<EventType, "id">;

const blank: Draft = {
  title: "",
  slug: "",
  description: "",
  duration: 30,
  color: "#8247f5",
  location_kind: "online_meeting",
  location_detail: "",
  active: 1,
  min_notice_minutes: 240,
  buffer_minutes: 0,
  max_days_ahead: 60,
  slot_interval: 30,
};

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export function EventTypeEditor() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const { host, toast } = useApp();
  const { t } = useI18n();
  const e = t.editor;
  const [draft, setDraft] = useState<Draft | null>(isNew ? blank : null);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isNew) api<EventType>(`/event-types/${id}`).then(setDraft, (e: Error) => setError(e.message));
  }, [id, isNew]);

  if (!draft) return <p className="muted">{error || t.common.loading}</p>;

  const meetingName = host?.calendar_provider === "microsoft" ? "Microsoft Teams" : host?.calendar_provider === "google" ? "Google Meet" : "";
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft({ ...draft, [key]: value });

  async function save(ev: FormEvent) {
    ev.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api(isNew ? "/event-types" : `/event-types/${id}`, { method: isNew ? "POST" : "PUT", body: draft });
      toast(isNew ? e.created : e.saved);
      navigate("/app");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(e.confirmDelete(draft!.title))) return;
    await api(`/event-types/${id}`, { method: "DELETE" });
    toast(e.deleted);
    navigate("/app");
  }

  return (
    <form onSubmit={save} style={{ maxWidth: 720 }}>
      <div className="page-head">
        <h1>{isNew ? e.newTitle : e.editTitle}</h1>
        <div className="row">
          <button type="button" className="btn btn-outline" onClick={() => navigate("/app")}>{t.common.cancel}</button>
          <button className="btn btn-primary" disabled={saving}>{saving ? t.common.saving : t.common.save}</button>
        </div>
      </div>

      <div className="card" style={{ padding: 28 }}>
        <div className="field">
          <label htmlFor="title">{e.name}</label>
          <input
            id="title"
            required
            value={draft.title}
            onChange={(ev) => setDraft({ ...draft, title: ev.target.value, slug: slugTouched ? draft.slug : slugify(ev.target.value) })}
          />
        </div>
        <div className="field">
          <label htmlFor="slug">{e.link}</label>
          <div className="row" style={{ gap: 6 }}>
            <span className="muted" style={{ whiteSpace: "nowrap" }}>{location.host}/{host?.slug}/</span>
            <input
              id="slug"
              required
              value={draft.slug}
              onChange={(ev) => {
                setSlugTouched(true);
                set("slug", slugify(ev.target.value));
              }}
            />
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="duration">{e.duration}</label>
            <select id="duration" value={draft.duration} onChange={(ev) => set("duration", Number(ev.target.value))}>
              {[15, 20, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{t.duration(m)}</option>)}
              {![15, 20, 30, 45, 60, 90, 120].includes(draft.duration) && <option value={draft.duration}>{t.duration(draft.duration)}</option>}
            </select>
          </div>
          <div className="field">
            <label htmlFor="loc">{e.location}</label>
            <select id="loc" value={draft.location_kind} onChange={(ev) => set("location_kind", ev.target.value as LocationKind)}>
              <option value="online_meeting">{e.onlineMeeting(meetingName)}</option>
              <option value="video">{e.ownVideo}</option>
              <option value="phone">{t.location.phone}</option>
              <option value="in_person">{t.location.in_person}</option>
            </select>
          </div>
        </div>
        {draft.location_kind === "online_meeting" && !host?.calendar_provider && (
          <p className="error" style={{ marginTop: -8 }}>
            {e.connectHint} <Link to="/app/settings">{e.settingsLink} →</Link>
          </p>
        )}
        {draft.location_kind !== "online_meeting" && <div className="field">
          <label htmlFor="locd">{e.locationDetails}</label>
          <input
            id="locd"
            placeholder={draft.location_kind === "in_person" ? e.placeholderAddress : draft.location_kind === "phone" ? e.placeholderPhone : e.placeholderLink}
            value={draft.location_detail}
            onChange={(ev) => set("location_detail", ev.target.value)}
          />
        </div>}
        <div className="field">
          <label htmlFor="desc">{e.description}</label>
          <textarea id="desc" value={draft.description} onChange={(ev) => set("description", ev.target.value)} />
        </div>
        <div className="field">
          <label>{e.color}</label>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {COLORS.map((c) => (
              <button
                type="button"
                key={c}
                aria-label={c}
                onClick={() => set("color", c)}
                className="dot"
                style={{ width: 30, height: 30, border: 0, background: c, outline: draft.color === c ? `3px solid ${c}` : "none", outlineOffset: 3 }}
              />
            ))}
          </div>
        </div>
      </div>

      <h2 style={{ fontSize: 18, margin: "28px 0 12px" }}>{e.limits}</h2>
      <div className="card" style={{ padding: 28 }}>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="notice">{e.minNotice}</label>
            <select id="notice" value={draft.min_notice_minutes} onChange={(ev) => set("min_notice_minutes", Number(ev.target.value))}>
              {([[0, e.none], [60, e.hours(1)], [240, e.hours(4)], [720, e.hours(12)], [1440, e.days(1)], [2880, e.days(2)]] as const).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <span className="hint">{e.minNoticeHint}</span>
          </div>
          <div className="field">
            <label htmlFor="window">{e.window}</label>
            <input id="window" type="number" min={1} max={365} value={draft.max_days_ahead} onChange={(ev) => set("max_days_ahead", Number(ev.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="buffer">{e.buffer}</label>
            <select id="buffer" value={draft.buffer_minutes} onChange={(ev) => set("buffer_minutes", Number(ev.target.value))}>
              {[0, 5, 10, 15, 30, 60].map((m) => <option key={m} value={m}>{m ? t.duration(m) : e.none}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="interval">{e.interval}</label>
            <select id="interval" value={draft.slot_interval} onChange={(ev) => set("slot_interval", Number(ev.target.value))}>
              {[10, 15, 20, 30, 60].map((m) => <option key={m} value={m}>{t.duration(m)}</option>)}
            </select>
          </div>
        </div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {!isNew && (
        <div style={{ marginTop: 28 }}>
          <button type="button" className="btn btn-danger" onClick={remove}>{e.deleteButton}</button>
        </div>
      )}
    </form>
  );
}
