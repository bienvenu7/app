# GitHub Actions secrets

Configure these secrets in:
`Repository -> Settings -> Secrets and variables -> Actions`

- `VPS_HOST`: VPS public IP or domain
- `VPS_PORT`: SSH port (usually `22`)
- `VPS_USER`: deploy user (example: `deploy`)
- `VPS_SSH_KEY`: private SSH key content for the deploy user

Optional variables:

- `VPS_APP_DIR`: defaults to `/var/www/landing`
