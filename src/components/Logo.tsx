import { Link } from "react-router";
import { BRAND } from "../brand.ts";

export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#006bff" />
      <path d="M9 11.5h14M9 16h9M9 20.5h11" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ to = "/" }: { to?: string }) {
  return (
    <Link to={to} className="logo" aria-label={BRAND}>
      <LogoMark />
      {BRAND}
    </Link>
  );
}
