import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { api, type EventType, type LocationKind } from "../../api.ts";
import { useApp } from "./AppLayout.tsx";

const COLORS = ["#f5c518", "#ff4f00", "#e55cff", "#8247f5", "#0099ff", "#0ae8f0", "#17e885", "#ccf000", "#ffa600"];

type Draft = Omit<EventType, "id">;

const blank: Draft = {
  title: "",
  slug: "",
  description: "",
  duration: 30,
  color: "#8247f5",
  location_kind: "video",
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
  const [draft, setDraft] = useState<Draft | null>(isNew ? blank : null);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isNew) api<EventType>(`/event-types/${id}`).then(setDraft, (e: Error) => setError(e.message));
  }, [id, isNew]);

  if (!draft) return <p className="muted">{error || "Loading…"}</p>;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft({ ...draft, [key]: value });

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api(isNew ? "/event-types" : `/event-types/${id}`, { method: isNew ? "POST" : "PUT", body: draft });
      toast(isNew ? "Event type created" : "Changes saved");
      navigate("/app");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete "${draft!.title}"? Its scheduled meetings will be removed too.`)) return;
    await api(`/event-types/${id}`, { method: "DELETE" });
    toast("Event type deleted");
    navigate("/app");
  }

  return (
    <form onSubmit={save} style={{ maxWidth: 720 }}>
      <div className="page-head">
        <h1>{isNew ? "New event type" : "Edit event type"}</h1>
        <div className="row">
          <button type="button" className="btn btn-outline" onClick={() => navigate("/app")}>Cancel</button>
          <button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>

      <div className="card" style={{ padding: 28 }}>
        <div className="field">
          <label htmlFor="title">Event name</label>
          <input
            id="title"
            required
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value, slug: slugTouched ? draft.slug : slugify(e.target.value) })}
          />
        </div>
        <div className="field">
          <label htmlFor="slug">Event link</label>
          <div className="row" style={{ gap: 6 }}>
            <span className="muted" style={{ whiteSpace: "nowrap" }}>{location.host}/{host?.slug}/</span>
            <input
              id="slug"
              required
              value={draft.slug}
              onChange={(e) => {
                setSlugTouched(true);
                set("slug", slugify(e.target.value));
              }}
            />
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="duration">Duration (minutes)</label>
            <select id="duration" value={draft.duration} onChange={(e) => set("duration", Number(e.target.value))}>
              {[15, 20, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} min</option>)}
              {![15, 20, 30, 45, 60, 90, 120].includes(draft.duration) && <option value={draft.duration}>{draft.duration} min</option>}
            </select>
          </div>
          <div className="field">
            <label htmlFor="loc">Location</label>
            <select id="loc" value={draft.location_kind} onChange={(e) => set("location_kind", e.target.value as LocationKind)}>
              <option value="video">Video call</option>
              <option value="phone">Phone call</option>
              <option value="in_person">In-person meeting</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="locd">Location details</label>
          <input
            id="locd"
            placeholder={draft.location_kind === "in_person" ? "Street address" : draft.location_kind === "phone" ? "Who calls whom" : "Meeting link"}
            value={draft.location_detail}
            onChange={(e) => set("location_detail", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="desc">Description / instructions</label>
          <textarea id="desc" value={draft.description} onChange={(e) => set("description", e.target.value)} />
        </div>
        <div className="field">
          <label>Event color</label>
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

      <h2 style={{ fontSize: 18, margin: "28px 0 12px" }}>Scheduling limits</h2>
      <div className="card" style={{ padding: 28 }}>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="notice">Minimum notice</label>
            <select id="notice" value={draft.min_notice_minutes} onChange={(e) => set("min_notice_minutes", Number(e.target.value))}>
              {[[0, "None"], [60, "1 hour"], [240, "4 hours"], [720, "12 hours"], [1440, "1 day"], [2880, "2 days"]].map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <span className="hint">Invitees can't book closer to the start than this.</span>
          </div>
          <div className="field">
            <label htmlFor="window">Booking window (days into the future)</label>
            <input id="window" type="number" min={1} max={365} value={draft.max_days_ahead} onChange={(e) => set("max_days_ahead", Number(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="buffer">Buffer before and after</label>
            <select id="buffer" value={draft.buffer_minutes} onChange={(e) => set("buffer_minutes", Number(e.target.value))}>
              {[0, 5, 10, 15, 30, 60].map((m) => <option key={m} value={m}>{m ? `${m} min` : "None"}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="interval">Start time increments</label>
            <select id="interval" value={draft.slot_interval} onChange={(e) => set("slot_interval", Number(e.target.value))}>
              {[10, 15, 20, 30, 60].map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </div>
        </div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {!isNew && (
        <div style={{ marginTop: 28 }}>
          <button type="button" className="btn btn-danger" onClick={remove}>Delete event type</button>
        </div>
      )}
    </form>
  );
}
