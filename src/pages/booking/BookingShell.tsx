import type { ReactNode } from "react";
import { Link } from "react-router";
import { BRAND } from "../../brand.ts";
import { useI18n } from "../../i18n.tsx";

export function BookingShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="booking-wrap">
      <div className="booking-card">
        <div className="badge">
          <Link to="/">
            {t.booking.poweredBy}<span>{BRAND}</span>
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}

export function NotFound({ title, detail }: { title?: string; detail?: string }) {
  const { t } = useI18n();
  return (
    <BookingShell>
      <div className="center-msg">
        <h1>{title ?? t.common.notFound}</h1>
        {detail && <p>{detail}</p>}
      </div>
    </BookingShell>
  );
}

export function Loading() {
  const { t } = useI18n();
  return (
    <BookingShell>
      <div className="center-msg">{t.common.loading}</div>
    </BookingShell>
  );
}

/** 404s get the translated "not found" page; other errors show the server's message. */
export function errorTitle(err: unknown, notFound: string) {
  return (err as { status?: number }).status === 404 ? notFound : (err as Error).message;
}
