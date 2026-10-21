# Cadence

A self-hosted, Calendly-style scheduling app. The UI flows were modeled on calendly.com, using
[REA](https://github.com/morluto/rea) browser captures of its marketing page and public booking pages.

## Run

Requires Node.js 24+ (uses the built-in `node:sqlite` and `Temporal`).

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # slot-engine tests
npm run build && npm start   # production
```

Data lives in `data/cadence.db` (override with `DB_PATH`). A demo host `kim` with three event types
and Mon–Fri 09:00–17:00 availability is seeded on first run.

## Pages

| URL | What |
| --- | --- |
| `/` | Marketing landing page |
| `/app` | Host dashboard: event types, meetings, availability, settings |
| `/:host` | Public page listing the host's event types |
| `/:host/:event` | Calendar → time slot → details form |
| `/booking/:token` | Invitee confirmation, with reschedule and cancel |

## How scheduling works

- Weekly hours are stored in the host's time zone; `server/slots.ts` expands them into slots and
  groups them by the invitee's local date, so DST and far-away time zones work correctly.
- Slots respect minimum notice, booking window, buffers and start-time increments per event type.
- Each booking re-checks the slot inside a write transaction, so a slot can't be double-booked.

## Language

Choose **Svenska** or **English** under **Settings**. It applies to the whole app: dashboard,
public booking pages, the landing page and all emails. Your own texts (event names, welcome
message) are shown as you wrote them.

## Email notifications

When a meeting is booked, rescheduled or cancelled, the invitee and the host (the email under
Settings) each get an email. The invitee's email carries a calendar invite (`.ics`) that updates or
cancels itself on later changes. Under **Settings → Email notifications** choose how they are sent:

- **SMTP server**: set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM`.
- **My Microsoft 365 mailbox**: sent through Microsoft Graph from the connected account (see
  below). No SMTP needed, and it works even where SMTP AUTH is disabled in Microsoft 365.

If neither is available, emails are only logged.

## Calendar and video meetings: Google or Microsoft 365

Connect **one** account under **Settings → Calendar & video meetings**. Event types with the location
**Online meeting** then get an event in that calendar with a video link for every booking: Google
Meet for Google, Microsoft Teams for Microsoft 365. The link is shown on the confirmation page and in
the emails. Rescheduling moves the event and cancelling deletes it. The calendar provider sends no
invitations of its own; the app's emails do. Switching accounts is one click ("Switch").

### Google

1. In [Google Cloud Console](https://console.cloud.google.com/): enable the **Google Calendar API**,
   configure the OAuth consent screen (add yourself as a test user), and create an
   **OAuth client ID** of type *Web application* with the redirect URI
   `<PUBLIC_URL>/api/calendar/google/callback`.
2. Set `PUBLIC_URL`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` and restart.

### Microsoft 365

1. In [Microsoft Entra admin center](https://entra.microsoft.com/) → **App registrations → New
   registration**: choose *Accounts in this organizational directory only*, and add a **Web**
   redirect URI `<PUBLIC_URL>/api/calendar/microsoft/callback`.
2. Under **Certificates & secrets**, create a client secret. Under **API permissions** add the
   delegated Microsoft Graph permissions `Calendars.ReadWrite`, `Mail.Send`, `User.Read` and
   `offline_access` (grant admin consent if your tenant requires it).
3. Set `PUBLIC_URL`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` and `MICROSOFT_TENANT_ID`
   (the *Directory (tenant) ID* from the app's overview page) and restart.

Teams links require a Microsoft 365 account with Teams. Client secrets expire (6–24 months);
create a new one in Entra before then.

## Not included (yet)

No login (the dashboard edits a single host), no reading busy times from the connected calendar, no
payments, teams or routing forms. The brand name is set in `src/brand.ts`.

## Self-hosting with Docker

```bash
git clone <your-repo-url> cadence && cd cadence
cp .env.example .env        # set ADMIN_PASSWORD
docker compose up -d --build
```

The app listens on port 3000 (change `PORT` in `.env`). The dashboard (`/app`) and its API are
protected with HTTP Basic auth using `ADMIN_USER` / `ADMIN_PASSWORD`; booking pages stay public.
Data is kept in the `cadence-data` volume. Put it behind a reverse proxy with HTTPS (Caddy,
Traefik, nginx) — Basic auth sends the password with every request, so don't expose it over plain HTTP.

Back up the database:

```bash
docker compose exec cadence node -e "require('node:sqlite'); new (require('node:sqlite').DatabaseSync)('/app/data/cadence.db').exec(\"VACUUM INTO '/app/data/backup.db'\")"
docker compose cp cadence:/app/data/backup.db ./backup.db
```
