import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { api, type Host } from "../../api.ts";
import { CalendarIcon, ClockIcon, LinkIcon, UserIcon } from "../../components/Icons.tsx";
import { Logo } from "../../components/Logo.tsx";

type Ctx = { host: Host | null; setHost: (h: Host) => void; toast: (msg: string) => void };
const AppContext = createContext<Ctx>({ host: null, setHost: () => {}, toast: () => {} });
export const useApp = () => useContext(AppContext);

export function AppLayout() {
  const [host, setHost] = useState<Host | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api<Host>("/me").then(setHost);
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
          <Link to="/app/event-types/new" className="btn btn-primary create">+ Create</Link>
          {nav("/app", "Scheduling", <LinkIcon />, true)}
          {nav("/app/meetings", "Meetings", <CalendarIcon />)}
          {nav("/app/availability", "Availability", <ClockIcon />)}
          {nav("/app/settings", "Settings", <UserIcon />)}
          {host && (
            <div className="bottom">
              Signed in as <strong>{host.name}</strong>
              <br />
              <Link to={`/${host.slug}`} target="_blank">View booking page ↗</Link>
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
