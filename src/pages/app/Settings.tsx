import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { api, type Language, type Owner } from "../../api.ts";
import { useI18n } from "../../i18n.tsx";
import { useApp } from "./AppLayout.tsx";

type ProviderId = "google" | "microsoft";

export function Settings() {
  const { host, setHost, toast } = useApp();
  const { t, setLanguage } = useI18n();
  const s = t.settings;
  const [draft, setDraft] = useState<Owner | null>(host);
  const [error, setError] = useState("");
  const [params, setParams] = useSearchParams();

  useEffect(() => setDraft(host), [host]);

  // Result of the OAuth redirect: /app/settings?calendar=connected&provider=...|error&message=...
  useEffect(() => {
    const result = params.get("calendar");
    if (!result) return;
    if (result === "connected") toast(s.connected(params.get("provider") === "microsoft" ? "Microsoft 365" : "Google"));
    else setError(s.connectFailed(params.get("message") ?? "?"));
    api<Owner>("/me").then(setHost);
    setParams({}, { replace: true });
  }, [params, setParams, setHost, toast, s]);

  if (!draft || !host) return <p className="muted">{t.common.loading}</p>;

  async function save(patch: Partial<Owner> = {}) {
    setError("");
    try {
      const saved = await api<Owner>("/me", { method: "PUT", body: { ...draft, ...patch } });
      setHost(saved);
      setLanguage(saved.language);
      toast(saved.language === "sv" ? "Inställningarna är sparade" : "Settings saved");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void save();
  }

  async function disconnect() {
    if (!confirm(s.confirmDisconnect)) return;
    setHost(await api<Owner>("/calendar/disconnect", { body: {} }));
    toast(s.disconnected);
  }

  const providers: { id: ProviderId; title: string; desc: string; env: string }[] = [
    { id: "google", title: s.google, desc: s.googleDesc, env: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET" },
    { id: "microsoft", title: s.microsoft, desc: s.microsoftDesc, env: "MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET" },
  ];
  const microsoftConnected = host.calendar_provider === "microsoft";

  return (
    <div style={{ maxWidth: 680 }}>
      <form onSubmit={submit}>
        <div className="page-head">
          <h1>{s.title}</h1>
          <button className="btn btn-primary">{t.common.save}</button>
        </div>
        <div className="card" style={{ padding: 28 }}>
          <div className="field">
            <label htmlFor="name">{s.name}</label>
            <input id="name" required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="email">{s.email}</label>
            <input id="email" type="email" required value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
            <span className="hint">{s.emailHint}</span>
          </div>
          <div className="field">
            <label htmlFor="slug">{s.yourLink}</label>
            <div className="row" style={{ gap: 6 }}>
              <span className="muted">{location.host}/</span>
              <input id="slug" required value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase() })} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="welcome">{s.welcome}</label>
            <textarea id="welcome" value={draft.welcome} onChange={(e) => setDraft({ ...draft, welcome: e.target.value })} />
            <span className="hint">{s.welcomeHint}</span>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="language">{s.language}</label>
            <select id="language" value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value as Language })}>
              <option value="sv">Svenska</option>
              <option value="en">English</option>
            </select>
            <span className="hint">{s.languageHint}</span>
          </div>
        </div>
      </form>

      {error && <p className="error" role="alert">{error}</p>}

      <h2 style={{ fontSize: 18, margin: "28px 0 6px" }}>{s.integrations}</h2>
      <p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>{s.integrationsHint}</p>
      <div className="card">
        {providers.map((p) => {
          const configured = host.providers_configured[p.id];
          const isConnected = host.calendar_provider === p.id;
          return (
            <div key={p.id} className="list-row" style={{ gridTemplateColumns: "1fr auto" }}>
              <div>
                <strong>{p.title}</strong>
                <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>
                  {!configured ? s.notConfigured(p.env) : isConnected ? s.connectedAs(host.calendar_email || p.title) : p.desc}
                </div>
              </div>
              {configured &&
                (isConnected ? (
                  <button className="btn btn-danger" onClick={disconnect}>{s.disconnect}</button>
                ) : (
                  <a className={`btn ${host.calendar_provider ? "btn-outline" : "btn-primary"}`} href={`/api/calendar/${p.id}/connect`}>
                    {host.calendar_provider ? s.switchTo : s.connect}
                  </a>
                ))}
            </div>
          );
        })}
      </div>

      <h2 style={{ fontSize: 18, margin: "28px 0 12px" }}>{s.emailTitle}</h2>
      <div className="card" style={{ padding: "20px 24px" }}>
        <div className="field">
          <label htmlFor="emailVia">{s.emailVia}</label>
          <select
            id="emailVia"
            value={draft.email_via}
            onChange={(e) => {
              const email_via = e.target.value as Owner["email_via"];
              setDraft({ ...draft, email_via });
              void save({ email_via });
            }}
          >
            <option value="smtp">{s.viaSmtp}</option>
            <option value="microsoft">{s.viaMicrosoft}</option>
          </select>
          {draft.email_via === "smtp" && !host.smtp_configured && <span className="hint">{s.smtpMissing}</span>}
          {draft.email_via === "microsoft" && !microsoftConnected && <span className="hint">{s.microsoftMissing}</span>}
        </div>
        <p style={{ fontSize: 14 }}>
          <strong style={{ color: host.email_enabled ? "var(--success)" : "var(--muted)" }}>
            {host.email_enabled ? s.enabled : s.disabled}
          </strong>{" "}
          <span className="muted">{host.email_enabled ? s.emailOn : s.emailOff}</span>
        </p>
      </div>
    </div>
  );
}
