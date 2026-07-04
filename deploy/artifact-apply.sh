#!/usr/bin/env bash
# Apply a prebuilt deploy.tar.gz (built in CI) on the VPS. Does not run next build.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/app}"
DEPLOY_USER="${DEPLOY_USER:-afrue}"
DEPLOY_HOME="${DEPLOY_HOME:-/home/${DEPLOY_USER}}"
TAR_PATH="${1:-${APP_DIR}/deploy.tar.gz}"

export HOME="${DEPLOY_HOME}"
if [[ "$(id -un)" != "${DEPLOY_USER}" ]]; then
  echo "Run as user ${DEPLOY_USER} (current: $(id -un))" >&2
  exit 1
fi

if [[ ! -f "${TAR_PATH}" ]]; then
  echo "Missing bundle: ${TAR_PATH}" >&2
  exit 1
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "${STAGE}"' EXIT

echo "Extracting ${TAR_PATH}..."
tar -xzf "${TAR_PATH}" -C "${STAGE}"

echo "Syncing app into ${APP_DIR} (preserving .git, .env*)..."
# .next/cache (images, etc.) est cree au runtime, souvent avec un autre user si PM2 a tourne en root:
# rsync --delete ne doit pas tenter de supprimer ce repertoire (Permission denied).
rsync -a --delete \
  --exclude='.git' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='.next/cache' \
  --exclude='.next/trace' \
  "${STAGE}"/ "${APP_DIR}"/

rm -f "${TAR_PATH}"
echo "Removed ${TAR_PATH}"

echo "Reloading PM2..."
pm2 startOrReload "${APP_DIR}/deploy/ecosystem.config.cjs" --update-env
pm2 save

echo "Artifact deploy done."
