export type LocationKind = "online_meeting" | "video" | "phone" | "in_person";

export type Language = "en" | "sv";

export type Host = {
  id?: number;
  name: string;
  slug: string;
  email?: string;
  timezone: string;
  welcome: string;
  language: Language;
  /** Calendar account that creates online meeting links, if any. */
  meeting_provider?: "google" | "microsoft" | "";
};

/** The host's own profile, as returned to the dashboard. */
export type Owner = Host & {
  email: string;
  calendar_provider: "google" | "microsoft" | "";
  calendar_email: string;
  email_via: "smtp" | "microsoft";
  providers_configured: { google: boolean; microsoft: boolean };
  smtp_configured: boolean;
  email_enabled: boolean;
};

export type EventType = {
  id: number;
  title: string;
  slug: string;
  description: string;
  duration: number;
  color: string;
  location_kind: LocationKind;
  location_detail: string;
  active: number;
  min_notice_minutes: number;
  buffer_minutes: number;
  max_days_ahead: number;
  slot_interval: number;
};

export type AvailabilityRule = { weekday: number; start_minute: number; end_minute: number };

export type Booking = {
  id: number;
  token: string;
  start_utc: string;
  end_utc: string;
  invitee_name: string;
  invitee_email: string;
  invitee_timezone: string;
  notes: string;
  status: "active" | "cancelled";
  cancel_reason: string;
  created_at: string;
  meeting_url: string;
};

export type ScheduledRow = Booking & {
  event_title: string;
  event_color: string;
  location_kind: LocationKind;
  location_detail: string;
};

export type BookingView = { booking: Booking; eventType: EventType; host: Host; emailed: boolean };

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Request failed.");
  return data as T;
}
