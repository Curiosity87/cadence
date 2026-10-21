import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { api, type Owner } from "../../api.ts";
import { CalendarIcon, ClockIcon, LinkIcon, UserIcon } from "../../components/Icons.tsx";
import { Logo } from "../../components/Logo.tsx";
import { useI18n } from "../../i18n.tsx";

type Ctx = { host: Owner | null; setHost: (h: Owner) => void; toast: (msg: string) => void };
const AppContext = createContext<Ctx>({ host: null, setHost: () => {}, toast: () => {} });
export const useApp = () => useContext(AppContext);

export function AppLayout() {
  const { t } = useI18n();
  const [host, setHost] = useState<Owner | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api<Owner>("/me").then(setHost);
  }, []);

  const toast = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage((m) => (m === msg ? "" : m)), 2400);
  }, []);

  const nav = (to: string, label: string, icon: React.ReactNode, end = false) => (
    <NavLink to={to} end={end} className={({ isActive }) => `nav${isActive ? " active" : ""}`}>
      {icon}
      {label}
    </NavLink>
  );

  return (
    <AppContext.Provider value={{ host, setHost, toast }}>
      <div className="app">
        <aside className="sidebar">
          <Logo to="/app" />
          <Link to="/app/event-types/new" className="btn btn-primary create">{t.nav.create}</Link>
          {nav("/app", t.nav.scheduling, <LinkIcon />, true)}
          {nav("/app/meetings", t.nav.meetings, <CalendarIcon />)}
          {nav("/app/availability", t.nav.availability, <ClockIcon />)}
          {nav("/app/settings", t.nav.settings, <UserIcon />)}
          {host && (
            <div className="bottom">
              {t.nav.signedInAs} <strong>{host.name}</strong>
              <br />
              <Link to={`/${host.slug}`} target="_blank">{t.nav.viewBookingPage}</Link>
            </div>
          )}
        </aside>
        <main className="main">
          <Outlet />
        </main>
      </div>
      {message && <div className="toast" role="status">{message}</div>}
    </AppContext.Provider>
  );
}
