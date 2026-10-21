import { useState } from "react";
import { Link } from "react-router";
import { BRAND } from "../brand.ts";
import { Logo } from "../components/Logo.tsx";

const PRODUCTS = [
  {
    key: "Scheduling",
    title: "Share one link. Let people book themselves.",
    body: "Publish your availability once and invitees pick a time that works in their own time zone — no back-and-forth emails.",
  },
  {
    key: "Reminders",
    title: "Fewer no-shows, zero chasing.",
    body: "Every invitee gets a confirmation with a private link to reschedule or cancel, so your calendar always reflects reality.",
  },
  {
    key: "Limits",
    title: "Protect your focus time.",
    body: "Minimum notice, buffers between meetings and a booking window keep your day under your control.",
  },
  {
    key: "Teams",
    title: "Built to grow with you.",
    body: "Start solo with as many event types as you need — intro calls, consultations, office hours — each with its own link.",
  },
];

const STEPS = [
  ["Book", "Send your link. Invitees see open times in their own time zone and book in seconds."],
  ["Prep", "Collect the context you need up front with notes on every booking."],
  ["Meet", "Video, phone or in person — the details travel with the invite."],
  ["Follow up", "Reschedules and cancellations update your meetings list automatically."],
];

const FEATURES = [
  ["Full control over your calendar", "Set weekly hours per day, split days into multiple ranges, and choose your time zone."],
  ["Event types for every scenario", "Create 15-minute intros, hour-long consultations and anything in between, each with its own color and URL."],
  ["Self-service reschedule & cancel", "Invitees manage their own booking through a private link — no inbox ping-pong."],
  ["Double-booking protection", "Every slot is re-checked at the moment of booking so two people can never grab the same time."],
];

export function Landing() {
  const [tab, setTab] = useState(0);
  const [openFeature, setOpenFeature] = useState(0);
  const product = PRODUCTS[tab];

  return (
    <div style={{ background: "#fbfaf8", minHeight: "100vh" }}>
      <div className="announce">
        Meet the all-new {BRAND} — scheduling without the busywork.
        <Link to="/kim">See a live booking page →</Link>
      </div>
      <header className="mk-nav">
        <Logo />
        <nav>
          <a href="#product">Product</a>
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
        </nav>
        <div className="spacer" />
        <Link to="/app" className="btn btn-outline hide-sm">Log In</Link>
        <Link to="/app" className="btn btn-dark">Get started for free</Link>
      </header>

      <section className="mk-hero">
        <h1>Scheduling that runs itself.</h1>
        <p>Share your link, let people pick a time, and get back to the work that matters. No accounts for invitees, no back-and-forth.</p>
        <div className="ctas">
          <Link to="/app" className="btn btn-dark btn-lg">Open your dashboard</Link>
          <Link to="/kim" className="btn btn-outline btn-lg">Try booking a meeting</Link>
        </div>
        <small>Free and self-hosted • No credit card required</small>
      </section>

      <section className="mk-section" id="product" style={{ textAlign: "center" }}>
        <p className="mk-eyebrow">Everything around the meeting</p>
        <h2>Book more meetings with less effort</h2>
        <div className="mk-tabs" role="tablist">
          {PRODUCTS.map((p, i) => (
            <button key={p.key} role="tab" className="mk-tab" aria-selected={tab === i} onClick={() => setTab(i)}>{p.key}</button>
          ))}
        </div>
        <div className="mk-panel" role="tabpanel" style={{ textAlign: "left" }}>
          <div>
            <h3>{product.title}</h3>
            <p>{product.body}</p>
            <Link to="/app" className="btn btn-dark">Learn more</Link>
          </div>
          <MockBooking />
        </div>
      </section>

      <section className="mk-section" id="how">
        <p className="mk-eyebrow">How it works</p>
        <h2>Built for people whose work runs on meetings</h2>
        <div className="mk-steps">
          {STEPS.map(([t, d]) => (
            <div className="mk-step" key={t}><h3>{t}</h3><p>{d}</p></div>
          ))}
        </div>
      </section>

      <section className="mk-section" id="features">
        <h2>A better way to book your meetings</h2>
        <div className="mk-accordion">
          <div>
            {FEATURES.map(([t, d], i) => (
              <button key={t} className="mk-acc-item" aria-expanded={openFeature === i} onClick={() => setOpenFeature(i)}>
                <strong>{t}</strong>
                {openFeature === i && <p>{d}</p>}
              </button>
            ))}
          </div>
          <MockBooking />
        </div>
      </section>

      <section className="mk-section">
        <div className="mk-cta">
          <h2>Get started in seconds — for free.</h2>
          <p>Set your hours, create an event type and share your link.</p>
          <Link to="/app" className="btn btn-primary btn-lg">Start for free</Link>
        </div>
      </section>

      <footer className="mk-footer">
        <Logo />
        <span>© {new Date().getFullYear()} {BRAND}. A self-hosted scheduling app.</span>
      </footer>
    </div>
  );
}

function MockBooking() {
  const days = Array.from({ length: 35 }, (_, i) => i - 2);
  return (
    <div className="mk-mock" aria-hidden="true">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 18 }}>
        <div style={{ borderRight: "1px solid var(--line)", paddingRight: 14 }}>
          <p className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Kim Lidberg</p>
          <p style={{ fontWeight: 700, fontSize: 18, margin: "6px 0 12px" }}>30 Minute Meeting</p>
          <p className="muted" style={{ fontSize: 13 }}>🕒 30 min</p>
          <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>🎥 Video call</p>
        </div>
        <div>
          <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Select a Date &amp; Time</p>
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
