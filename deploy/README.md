# Deployment

Server: Hetzner cpx11 (178.156.188.200, Ashburn US East)
Domain: coil.5am.team (Cloudflare proxied, Full Strict SSL via Origin Certificate)

## Stack

- Next.js app — Docker, port 3000 (bound to 127.0.0.1 only)
- Supabase minimal: GoTrue (auth) + PostgREST + Postgres 17 — Docker Compose, localhost ports
- Nginx — reverse proxy, SSL termination via Cloudflare Origin Certificate
- No certbot — 15-year Cloudflare Origin Cert at /etc/ssl/cloudflare/

## Security

- No root SSH — deploy user with passwordless sudo only
- Hetzner Cloud Firewall (coil-firewall): SSH + HTTP + HTTPS only, applied via label selector
- No fail2ban — Hetzner firewall is the perimeter
- Cloudflare Full (Strict) SSL

## First-time setup

See infrastructure/vm-setup.md for full provisioning guide.

### Fix init.sql passwords after first boot

The init.sql uses PLACEHOLDER_AUTH_PW. After first `docker compose up`, run:

```bash
AUTH_PW=<your AUTH_ADMIN_PW>
docker exec supabase-db-1 psql -U postgres -c "
  ALTER ROLE supabase_auth_admin WITH PASSWORD '$AUTH_PW';
  ALTER ROLE authenticator WITH PASSWORD '$AUTH_PW';
"
cd /opt/supabase && docker compose --env-file .env restart auth rest
```

## Redeploy (app updates)

Handled automatically via GitHub Actions on merge to main.
Manual redeploy:

```bash
cd /opt/coil
git pull
docker build -t coil-app .
docker stop coil && docker rm coil
docker run -d --name coil --restart unless-stopped \
  -p 127.0.0.1:3000:3000 --env-file .env.local coil-app
```

## Weekly email cron

Configured in deploy user's crontab:
```
0 20 * * 0 curl -s -X POST https://coil.5am.team/api/cron/weekly-email \
  -H "Authorization: Bearer $CRON_SECRET" >> /var/log/coil-cron.log 2>&1
```
