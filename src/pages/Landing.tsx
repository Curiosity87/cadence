import { useState } from "react";
import { Link } from "react-router";
import { BRAND } from "../brand.ts";
import { Logo } from "../components/Logo.tsx";
import { useI18n } from "../i18n.tsx";

export function Landing() {
  const { t, hostSlug } = useI18n();
  const l = t.landing;
  const [tab, setTab] = useState(0);
  const [openFeature, setOpenFeature] = useState(0);
  const product = l.products[tab];
  const bookingPage = `/${hostSlug}`;

  return (
    <div style={{ background: "#fbfaf8", minHeight: "100vh" }}>
      <div className="announce">
        {l.announce}
        <Link to={bookingPage}>{l.seeLive}</Link>
      </div>
      <header className="mk-nav">
        <Logo />
        <nav>
          <a href="#product">{l.nav.product}</a>
          <a href="#how">{l.nav.how}</a>
          <a href="#features">{l.nav.features}</a>
        </nav>
        <div className="spacer" />
        <Link to="/app" className="btn btn-outline hide-sm">{l.login}</Link>
        <Link to="/app" className="btn btn-dark">{l.getStarted}</Link>
      </header>

      <section className="mk-hero">
        <h1>{l.heroTitle}</h1>
        <p>{l.heroText}</p>
        <div className="ctas">
          <Link to="/app" className="btn btn-dark btn-lg">{l.openDashboard}</Link>
          <Link to={bookingPage} className="btn btn-outline btn-lg">{l.tryBooking}</Link>
        </div>
        <small>{l.heroSmall}</small>
      </section>

      <section className="mk-section" id="product" style={{ textAlign: "center" }}>
        <p className="mk-eyebrow">{l.eyebrow}</p>
        <h2>{l.productTitle}</h2>
        <div className="mk-tabs" role="tablist">
          {l.products.map((p, i) => (
            <button key={p.key} role="tab" className="mk-tab" aria-selected={tab === i} onClick={() => setTab(i)}>{p.key}</button>
          ))}
        </div>
        <div className="mk-panel" role="tabpanel" style={{ textAlign: "left" }}>
          <div>
            <h3>{product.title}</h3>
            <p>{product.body}</p>
            <Link to="/app" className="btn btn-dark">{l.learnMore}</Link>
          </div>
          <MockBooking title={l.mockTitle} label={t.booking.selectDateTime} />
        </div>
      </section>

      <section className="mk-section" id="how">
        <p className="mk-eyebrow">{l.howEyebrow}</p>
        <h2>{l.howTitle}</h2>
        <div className="mk-steps">
          {l.steps.map(([title, d]) => (
            <div className="mk-step" key={title}><h3>{title}</h3><p>{d}</p></div>
          ))}
        </div>
      </section>

      <section className="mk-section" id="features">
        <h2>{l.featuresTitle}</h2>
        <div className="mk-accordion">
          <div>
            {l.features.map(([title, d], i) => (
              <button key={title} className="mk-acc-item" aria-expanded={openFeature === i} onClick={() => setOpenFeature(i)}>
                <strong>{title}</strong>
                {openFeature === i && <p>{d}</p>}
              </button>
            ))}
          </div>
          <MockBooking title={l.mockTitle} label={t.booking.selectDateTime} />
        </div>
      </section>

      <section className="mk-section">
        <div className="mk-cta">
          <h2>{l.ctaTitle}</h2>
          <p>{l.ctaText}</p>
          <Link to="/app" className="btn btn-primary btn-lg">{l.ctaButton}</Link>
        </div>
      </section>

      <footer className="mk-footer">
        <Logo />
        <span>© {new Date().getFullYear()} {BRAND}. {l.footer}</span>
      </footer>
    </div>
  );
}

function MockBooking({ title, label }: { title: string; label: string }) {
  const days = Array.from({ length: 35 }, (_, i) => i - 2);
  return (
    <div className="mk-mock" aria-hidden="true">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 18 }}>
        <div style={{ borderRight: "1px solid var(--line)", paddingRight: 14 }}>
          <p className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Kim Lidberg</p>
          <p style={{ fontWeight: 700, fontSize: 18, margin: "6px 0 12px" }}>{title}</p>
          <p className="muted" style={{ fontSize: 13 }}>🕒 30 min</p>
          <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>🎥 Google Meet / Teams</p>
        </div>
        <div>
          <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>{label}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
            {days.map((d) => {
              const on = d > 3 && d < 30 && d % 7 !== 3 && d % 7 !== 4;
              return (
                <span
                  key={d}
                  style={{
                    aspectRatio: "1", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 11,
                    background: d === 9 ? "var(--primary)" : on ? "var(--primary-soft)" : "none",
                    color: d === 9 ? "#fff" : on ? "var(--primary)" : "#b8c7d6", fontWeight: on ? 700 : 400,
                  }}
                >
                  {d > 0 && d <= 31 ? d : ""}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
