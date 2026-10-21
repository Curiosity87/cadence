import type { ReactNode } from "react";
import { Link } from "react-router";
import { BRAND } from "../../brand.ts";

export function BookingShell({ children }: { children: ReactNode }) {
  return (
    <div className="booking-wrap">
      <div className="booking-card">
        <div className="badge">
          <Link to="/">
            Powered by<span>{BRAND}</span>
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}

export function NotFound({ title, detail }: { title: string; detail?: string }) {
  return (
    <BookingShell>
      <div className="center-msg">
        <h1>{title}</h1>
        {detail && <p>{detail}</p>}
      </div>
    </BookingShell>
  );
}
