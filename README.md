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

## Not included (yet)

No login (the dashboard edits a single host), no email/calendar invites, no Google/Outlook
calendar sync, no payments, teams or routing forms. The brand name is set in `src/brand.ts`.

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
