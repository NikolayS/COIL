# COIL Infrastructure Requirements

> Requirements for provisioning and securing a COIL production server.
> All setup must be reproducible from this document alone.

## Server Spec

- **Provider:** Hetzner Cloud
- **Location:** US East (Ashburn, Virginia) — `ash` datacenter
- **Type:** cx22 (2 vCPU, 4 GB RAM, 40 GB SSD) or cx32 if needed
- **OS:** Ubuntu 24.04 LTS
- **Hostname:** `coil-app`

## Firewall (Hetzner Cloud Firewall — applied at network level, before the VM)

Only two inbound rules — everything else dropped:

| Direction | Protocol | Port | Source |
|-----------|----------|------|--------|
| Inbound   | TCP      | 22   | Anywhere |
| Inbound   | TCP      | 443  | Anywhere |
| Inbound   | TCP      | 80   | Anywhere (redirect to 443 only) |
| Outbound  | Any      | Any  | Anywhere |

**No ufw/fail2ban managing SSH bans.** The Hetzner firewall is the perimeter — no other ports exposed.

## Initial Server Setup

### 1. Create deploy user (no root SSH)

```bash
# Run as root on first boot
useradd -m -s /bin/bash deploy
usermod -aG sudo deploy
echo 'deploy ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/deploy
chmod 440 /etc/sudoers.d/deploy

# Add SSH key
mkdir -p /home/deploy/.ssh
echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFAfjnVH0F8RCGECA5lTGo4UUaNChdHmm/e/ChTyuXEW tars@openclaw' \
  > /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

### 2. Harden SSH

```bash
cat > /etc/ssh/sshd_config.d/hardening.conf << 'EOF'
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
X11Forwarding no
MaxAuthTries 3
EOF
systemctl restart ssh
```

### 3. Install dependencies

```bash
apt-get update && apt-get install -y \
  docker.io \
  docker-compose-v2 \
  nginx \
  certbot \
  python3-certbot-nginx \
  git \
  curl \
  jq

systemctl enable --now docker nginx
usermod -aG docker deploy
```

### 4. Directory structure

```
/opt/coil/         — Next.js app (git clone of NikolayS/COIL)
/opt/supabase/     — Supabase docker-compose + .env
```

```bash
mkdir -p /opt/coil /opt/supabase
chown deploy:deploy /opt/coil /opt/supabase
```

## Supabase Setup

```bash
cd /opt/supabase
cp /opt/coil/supabase/.env.example .env
# Fill in: POSTGRES_PASSWORD, AUTH_ADMIN_PW, JWT_SECRET, SMTP_PASS
# Update SITE_URL and API_EXTERNAL_URL to the new domain

docker compose --env-file .env up -d
```

Services run on localhost only (no external ports):
- Postgres: `127.0.0.1:5432`
- GoTrue: `127.0.0.1:9999`
- PostgREST: `127.0.0.1:3001`

## Next.js App Setup

```bash
cd /opt/coil
git clone https://github.com/NikolayS/COIL.git .

# Create .env.local
cat > .env.local << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://coil.5am.team
NEXT_PUBLIC_SITE_URL=https://coil.5am.team
NEXT_PUBLIC_APP_URL=https://coil.5am.team
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase .env>
SUPABASE_SERVICE_ROLE_KEY=<service role key from supabase .env>
RESEND_API_KEY=<resend key>
CRON_SECRET=<random secret>
EOF

docker build -t coil-app .
docker run -d \
  --name coil \
  --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  --env-file .env.local \
  coil-app
```

Note: bind to `127.0.0.1:3000` only — not exposed externally.

## Nginx Setup

```bash
# Get SSL cert first (port 80 must be open)
certbot --nginx -d coil.5am.team --non-interactive --agree-tos -m admin@5am.team

# Copy config
cp /opt/coil/deploy/nginx.conf /etc/nginx/sites-enabled/coil
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

The nginx config from `deploy/nginx.conf` is the canonical config.
Key settings applied on top (not in repo yet — fix before deploy):

```nginx
# In each proxy_pass location block:
proxy_buffer_size 16k;
proxy_buffers 4 16k;
proxy_busy_buffers_size 32k;

# Use 127.0.0.1 explicitly (not localhost — avoids IPv6 resolution issues)
proxy_pass http://127.0.0.1:3000;
```

## GitHub Actions Secrets

Update these in `NikolayS/COIL` → Settings → Secrets:

| Secret | Value |
|--------|-------|
| `DEPLOY_HOST` | New server IP |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | Private key corresponding to the authorized public key |

## Weekly Email Cron

```bash
# As deploy user
crontab -e
# Add:
0 20 * * 0 curl -s -X POST https://coil.5am.team/api/cron/weekly-email \
  -H "Authorization: Bearer $CRON_SECRET" >> /var/log/coil-cron.log 2>&1
```

## DNS Cutover (Cloudflare)

1. Provision new server, deploy, verify everything works at new IP
2. Update A record: `coil.5am.team` → new IP (DNS-only, no proxy)
3. Re-run certbot if needed for new IP
4. Keep old server running for 24h as fallback
5. Decommission old server after confirming clean traffic

## Known Issues Fixed in This Setup

- **Fail2Ban SSH bans:** Eliminated — Hetzner firewall handles perimeter, no fail2ban on SSH
- **nginx proxy buffer too small:** Fixed with `proxy_buffer_size 16k` (Supabase auth returns large headers)
- **IPv6 localhost resolution:** Fixed by using `127.0.0.1` explicitly in nginx
- **Root SSH access:** Eliminated — `deploy` user with passwordless sudo only
- **authorized_keys wiped:** Was never in git — now documented explicitly
