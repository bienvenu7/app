# GitHub Actions secrets

Configure these secrets in:
`Repository -> Settings -> Secrets and variables -> Actions`

- `VPS_HOST`: VPS public IP or domain
- `VPS_PORT`: SSH port (usually `22`)
- `VPS_USER`: deploy user (example: `afrue`)
- `VPS_SSH_KEY`: private SSH key content for the deploy user

Optional (Telegram notifications):

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

## Runtime environment on the VPS

These live in `/var/www/app/.env`, not in GitHub Actions — they are read at
runtime by `next-server`, not baked into the build. See `.env.example`.

- `AUTH_SESSION_SECRET`: **required**, at least 16 characters. HMAC key for the
  signed `authSession` cookie. Generate with `openssl rand -hex 32`. There is no
  fallback: if it is missing, every request fails with a 500 instead of silently
  accepting forgeable session cookies.

## Deploy model (same as landing)

1. GitHub Actions builds the Next.js standalone bundle (`npm ci` + `npm run build`).
2. CI uploads `deploy.tar.gz` to `/var/www/app/` on the VPS.
3. VPS only runs `bash deploy/artifact-apply.sh` (extract + rsync + PM2 reload).
4. No `npm run build` on the server for normal deploys.

App path on VPS: `/var/www/app`  
PM2 process: `app` on port `1112`  
Trigger branch: `app`

`.env` / `.env.*` on the VPS are preserved and never overwritten by the bundle.
