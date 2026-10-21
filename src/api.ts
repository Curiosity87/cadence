export type LocationKind = "video" | "phone" | "in_person";

export type Host = { id?: number; name: string; slug: string; email?: string; timezone: string; welcome: string };

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
};

export type ScheduledRow = Booking & {
  event_title: string;
  event_color: string;
  location_kind: LocationKind;
  location_detail: string;
};

export type BookingView = { booking: Booking; eventType: EventType; host: Host };

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

export const LOCATION_LABEL: Record<LocationKind, string> = {
  video: "Video call",
  phone: "Phone call",
  in_person: "In-person meeting",
};
