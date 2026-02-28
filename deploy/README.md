# Deployment

Server: Hetzner cx23 (46.225.209.88, Nuremberg)
Domain: coil.5am.team (Cloudflare DNS-only, certbot SSL)

## Stack

- Next.js app — Docker, port 3000
- Supabase minimal: GoTrue (auth) + PostgREST + Postgres 17 — Docker Compose, localhost ports
- Nginx — reverse proxy, SSL termination

## First-time setup

### 1. Supabase backend

```bash
cd /opt/supabase
cp /path/to/repo/supabase/.env.example .env
# Fill in .env values
docker compose --env-file .env up -d
```

### 2. Next.js app

```bash
cd /opt/coil
git clone https://github.com/NikolayS/COIL.git .
# Create .env.local with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
docker build -t coil-app .
docker run -d --name coil --restart unless-stopped -p 3000:3000 --env-file .env.local coil-app
```

### 3. Nginx

```bash
cp /path/to/repo/deploy/nginx.conf /etc/nginx/sites-enabled/coil
# Run certbot first to get SSL cert, then uncomment ssl lines
certbot --nginx -d coil.5am.team
nginx -t && systemctl reload nginx
```

### 4. Weekly email cron

```bash
# Add to server crontab (crontab -e):
# Every Sunday at 8pm UTC
0 20 * * 0 curl -s -X POST https://coil.5am.team/api/cron/weekly-email \
  -H "Authorization: Bearer $CRON_SECRET" > /var/log/coil-cron.log 2>&1
```

Set `CRON_SECRET` and `RESEND_API_KEY` in `.env.local` on the server.

## Redeploy (app updates)

```bash
cd /opt/coil
git pull
docker build -t coil-app .
docker stop coil && docker rm coil
docker run -d --name coil --restart unless-stopped -p 3000:3000 --env-file .env.local coil-app
```
