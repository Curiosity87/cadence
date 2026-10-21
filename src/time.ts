import { getLocale } from "./i18n.tsx";

export const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export const allTimezones = (): string[] =>
  typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [browserTimezone()];

export function formatTime(iso: string, timeZone: string, hour12 = false) {
  return new Intl.DateTimeFormat(getLocale(), { timeZone, hour: "numeric", minute: "2-digit", hour12 }).format(new Date(iso));
}

export function formatLongDate(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat(getLocale(), { timeZone, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(
    new Date(iso),
  );
}

/** Weekday and date of a local calendar day (YYYY-MM-DD), e.g. "Thursday, October 22". */
export function formatDay(isoDate: string) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString(getLocale(), { weekday: "long", month: "long", day: "numeric" });
}

export function formatMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex, 1).toLocaleString(getLocale(), { month: "long", year: "numeric" });
}

/** "09:30 - 10:00, Wednesday, October 22, 2026" */
export function formatRange(startIso: string, endIso: string, timeZone: string, hour12 = false) {
  return `${formatTime(startIso, timeZone, hour12)} - ${formatTime(endIso, timeZone, hour12)}, ${formatLongDate(startIso, timeZone)}`;
}

export function timezoneLabel(timeZone: string) {
  const offset = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" })
    .formatToParts(new Date())
    .find((p) => p.type === "timeZoneName")?.value;
  return `${timeZone.replaceAll("_", " ")} (${offset ?? ""})`;
}

export function minutesToHHMM(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function hhmmToMinutes(s: string) {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

/** Local calendar month as "YYYY-MM". */
export function monthKey(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}
