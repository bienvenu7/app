#!/usr/bin/env bash
# Build on the VPS (legacy / emergency). For normal CI, use a GitHub-build bundle + deploy/artifact-apply.sh
set -euo pipefail

APP_DIR="/var/www/app"
BRANCH="${1:-app}"
DEPLOY_USER="${DEPLOY_USER:-afrue}"
DEPLOY_HOME="${DEPLOY_HOME:-/home/${DEPLOY_USER}}"
DEPLOY_SSH_KEY="${DEPLOY_HOME}/.ssh/id_ed25519"

# Sessions SSH non-interactives: HOME peut etre absent/invalide.
# On force le HOME attendu pour l'utilisateur de deploy.
export HOME="${DEPLOY_HOME}"
CURRENT_USER="$(id -un)"

if [[ "${CURRENT_USER}" != "${DEPLOY_USER}" ]]; then
  echo "Ce script doit etre execute par '${DEPLOY_USER}', utilisateur courant: '${CURRENT_USER}'." >&2
  exit 1
fi

# Cle GitHub imposee pour ce serveur (ignore les variables heritees).
GIT_SSH_IDENTITY_FILE="${DEPLOY_SSH_KEY}"

if [[ ! -f "${GIT_SSH_IDENTITY_FILE}" ]]; then
  echo "Cle SSH introuvable: ${GIT_SSH_IDENTITY_FILE}" >&2
  exit 1
fi

export GIT_SSH_COMMAND="ssh -i ${GIT_SSH_IDENTITY_FILE} -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new"

echo "Deploy branch: ${BRANCH} (VPS build)"
cd "${APP_DIR}"

if [[ "${SKIP_GIT_SYNC:-0}" != "1" ]]; then
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "Changements locaux detectes sur le VPS, nettoyage automatique en cours..."
    git reset --hard HEAD
    git clean -fd
  fi

  git fetch --prune origin

  if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
    git checkout "${BRANCH}"
  else
    git checkout -b "${BRANCH}" "origin/${BRANCH}"
  fi

  git pull --ff-only origin "${BRANCH}"
else
  echo "Git sync skipped (already handled by workflow bootstrap)."
fi

npm ci
npm run build

pm2 startOrReload "${APP_DIR}/deploy/ecosystem.config.cjs" --update-env
pm2 save

echo "Deploy done."
