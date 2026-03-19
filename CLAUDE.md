# CLAUDE.md

## Engineering Standards

Follow the rules at https://gitlab.com/postgres-ai/rules/-/tree/main/rules — always pull latest before starting work.

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
- **Deploy** (`deploy.yml`): triggers on `v20*` tags — DB migrations + Docker build + restart on server

Version schema: `vYYYY.MM.DD.N` (e.g. `v2026.03.11.2`). N is a sequential counter for same-day releases.

Never deploy by pushing directly to the server. Always: merge PR → tag → let the workflow deploy.

## Stack

- Next.js 16, React 19, TypeScript
- Supabase (self-hosted) — Postgres + Auth + REST
- Docker (node:22-alpine), nginx reverse proxy, Cloudflare SSL
- Server: Hetzner cpx11, deploy user: `deploy@178.156.188.200`
- App container: `coil`, port 3000, app at `/opt/coil/`

## Key Patterns

- Supabase client: `src/lib/supabase.ts` — use SSR client in server components, browser client in client components
- API routes: `src/app/api/` — all protected endpoints check auth or cron secret
- Cron secret: `process.env.CRON_SECRET` — required in `Authorization: Bearer` header for cron endpoints
- Week data stored in `weeks` table: `(user_id, week_of DATE)` unique key
