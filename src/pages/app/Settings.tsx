import { useEffect, useState, type FormEvent } from "react";
import { api, type Host } from "../../api.ts";
import { useApp } from "./AppLayout.tsx";

export function Settings() {
  const { host, setHost, toast } = useApp();
  const [draft, setDraft] = useState<Host | null>(host);
  const [error, setError] = useState("");

  useEffect(() => setDraft(host), [host]);
  if (!draft) return <p className="muted">Loading…</p>;

  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      setHost(await api<Host>("/me", { method: "PUT", body: draft }));
      toast("Profile saved");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form onSubmit={save} style={{ maxWidth: 640 }}>
      <div className="page-head">
        <h1>Settings</h1>
        <button className="btn btn-primary">Save</button>
      </div>
      <div className="card" style={{ padding: 28 }}>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required value={draft.email ?? ""} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="slug">Your link</label>
          <div className="row" style={{ gap: 6 }}>
            <span className="muted">{location.host}/</span>
            <input id="slug" required value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase() })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="welcome">Welcome message</label>
          <textarea id="welcome" value={draft.welcome} onChange={(e) => setDraft({ ...draft, welcome: e.target.value })} />
          <span className="hint">Shown at the top of your booking page.</span>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </form>
  );
}
