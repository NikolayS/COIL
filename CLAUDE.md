# CLAUDE.md

## Engineering Standards

Follow the rules at https://gitlab.com/postgres-ai/rules/-/tree/main/rules — always pull latest before starting work.

## What is COIL

COIL is a personal weekly tracking app at https://coil.5am.team. Users score 7 life territories (Self, Health, Work, Family, Social, Finance, Growth) daily on a 0–5 scale. The app computes weekly scores, lets users export as PDF or rich text, and emails reports. Single-user focus — each account is fully isolated via Supabase RLS.

## Branching

- **`main` is the production branch.** Never push directly to `main`.
- All work happens in feature branches: `feat/`, `fix/`, `docs/`, `chore/` prefixes.
- Open a PR to merge into `main`.
- Branch names must be short and descriptive (e.g. `fix/send-email-week-selector`, `feat/web-push`).
- Delete branches after merging.

## Pull Requests

- Every change goes through a PR — no direct pushes to `main`.
- CI must be green (Build + Unit Tests + E2E) before merging.
- Run a REV review (https://gitlab.com/postgres-ai/rev/) and post the report as a PR comment before merging.
- Use squash merge. Write a clean one-line commit message.
- Never merge without explicit approval from the project owner.

## Deployment

CI/GitOps via GitHub Actions:

- **CI** (`ci.yml`): runs on push to `main` and PRs — unit tests (Vitest), build, E2E (Playwright)
- **Deploy** (`deploy.yml`): triggers on `v20*` tags — DB migrations + Docker build + blue/green restart on server
- **Preview** (`preview.yml`): triggers on PR open/push/close — builds Docker image, deploys to `coil-{branch}.5am.team`, destroys on PR close

Version schema: `vYYYY.MM.DD.N` (e.g. `v2026.03.18.1`). N is a sequential counter for same-day releases.

**Deployment flow:**
1. Merge PR to `main`
2. `git tag vYYYY.MM.DD.N && git push origin <tag>`
3. Actions deploys automatically (blue/green, health check, nginx swap)

## Preview Environments

Every PR gets a live preview at `https://coil-{branch}.5am.team/` (e.g. `https://coil-feat-my-feature.5am.team`).

- Deployed automatically on PR open/push via `.github/workflows/preview.yml`
- Destroyed automatically on PR close
- PR gets a comment with the preview URL
- Footer shows `preview-{sha} · {branch}` to distinguish from production

The preview infra lives on the same server as production:
- nginx config: `/etc/nginx/sites-enabled/coil-preview`
- port map: `/etc/nginx/coil-preview-ports.conf`
- deploy script: `/opt/coil/deploy-preview.sh`
- destroy script: `/opt/coil/destroy-preview.sh`
- containers named `coil-preview-{safe-branch}`, ports 3100–3999
- wildcard SSL: `/etc/ssl/cloudflare/wildcard-5am.crt` (valid 2041)

## Stack

- Next.js 16, React 19, TypeScript
- Supabase (self-hosted, not cloud) — Postgres + Auth + REST at `/opt/supabase/`
- Docker (node:22-alpine), nginx reverse proxy, Cloudflare SSL
- Server: Hetzner cpx11, deploy user: `deploy@178.156.188.200`
- App container: `coil`, port 3000, app at `/opt/coil/`
- Email: Resend API (`RESEND_API_KEY`)

## URL Schema

- `/` — main app (redirects to `/login` if not authenticated)
- `/login` — auth (Google OAuth + magic link + demo mode)
- `/auth/callback` — Supabase auth callback (nginx proxied to app)
- `/auth/v1/*` — Supabase GoTrue (nginx proxied to port 9999)
- `/rest/v1/*` — Supabase PostgREST (nginx proxied to port 3001)
- `/api/email/test` — POST, send weekly report email (accepts `userId`, `weekOf`, `includePdf`)
- `/api/cron/daily-reminder` — GET, send daily reminders (requires `Authorization: Bearer {CRON_SECRET}`)
- `/api/cron/weekly-email` — POST, send weekly email reports (requires `Authorization: Bearer {CRON_SECRET}`)
- `/api/pdf/download` — POST, generate and return PDF (requires auth session)

## Database Schema

Key tables (all in Supabase Postgres, RLS enabled):

```
weeks (id, user_id, week_of DATE, data jsonb, archived bool)
  -- data: {territories: [{id, name, scores: {mon..sun}}], notes: {...}}
  -- unique on (user_id, week_of)

settings (user_id PK,
  report_email text,          -- email for reports (defaults to auth email)
  weekly_email_day text,      -- 'sunday'|'monday'|...
  email_pdf bool,             -- attach PDF to weekly email
  reminder1_enabled bool, reminder1_hour int,   -- first daily reminder
  reminder2_enabled bool, reminder2_hour int,   -- second daily reminder
  week_start text,            -- 'monday'|'sunday'
  notes text)                 -- personal notes (dietary etc.)
```

## Key Patterns

- Supabase client: `src/lib/supabase.ts` — use SSR client in server components, browser client in client components
- API routes: `src/app/api/` — protected endpoints check auth session or cron secret
- Cron secret: `process.env.CRON_SECRET` — required in `Authorization: Bearer` header for cron endpoints
- System cron on server calls `/api/cron/daily-reminder` hourly and `/api/cron/weekly-email` Sunday 8pm PST

## What's Built

- ✅ Daily scoring (7 territories × 7 days, 0–5 scale)
- ✅ Weekly score and progress view
- ✅ Past weeks navigation
- ✅ Export: AI Chat copy, Rich Copy (TPM), PDF download, Send Email
- ✅ Settings: report email, reminders, week start day, theme (light/dark/auto)
- ✅ iOS PWA (standalone mode, add to home screen)
- ✅ Email reminders via Resend
- ✅ Weekly email report with PDF
- ✅ Preview environments per PR

## What's Next (Priority Order)

### 1. Web Push Notifications
Design agreed: push when available, email as fallback, user-configurable in Settings.

VAPID keys already generated (do NOT regenerate). Keys are stored securely — ask Nik for access.
- Add to `/opt/coil/.env.local` on server as `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`

Needs to build:
- `public/sw.js` — service worker for push
- `push_subscriptions` table in Supabase: `(id, user_id, endpoint, keys_p256dh, keys_auth, created_at)`
- `/api/push/subscribe` POST — save subscription
- `/api/push/send` POST — send push to user
- Update `/api/cron/daily-reminder` to call push + email
- Settings UI: "Enable push notifications" toggle
- Export tab: "Send Push" button alongside "Send Email"

### 2. Fix `/api/email/test` Auth
Currently accepts `userId` from request body with no session verification (uses service role key). Should verify the caller's session matches the `userId`. Other API routes use `supabase.auth.getUser()`.

### 3. GitHub Actions Billing
Free Actions minutes are exhausted — preview env workflow can't run. Add payment method at https://github.com/settings/billing or increase spending limit.
