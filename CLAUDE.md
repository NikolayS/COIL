# CLAUDE.md

## Engineering Standards

Follow the rules at https://gitlab.com/postgres-ai/rules/-/tree/main/rules — always pull latest before starting work.

## Deployment

CI/GitOps via GitHub Actions:

- **CI** (`ci.yml`): runs on push to `main` and PRs — unit tests (Vitest), build, E2E (Playwright)
- **Deploy** (`deploy.yml`): triggers on `v20*` tags — DB migrations + Docker build + restart on server

Version schema: `vYYYY.MM.DD.N` (e.g. `v2026.03.11.2`). N is a sequential counter for same-day releases.

Never deploy by pushing directly to the server. Always tag → let the workflow deploy.

## Code Review

All changes go through PRs. Before merging, run a REV review (https://gitlab.com/postgres-ai/rev/) and post the report as a PR comment. REV is designed for GitLab but works on GitHub PRs too.

Never merge without explicit approval from the project owner.

## Stack

- Next.js 16, React 19, TypeScript
- Supabase (self-hosted) — Postgres + Auth + REST
- Docker (node:22-alpine), nginx reverse proxy, Cloudflare SSL
- Server: Hetzner cpx11
