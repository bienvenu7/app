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

# Cles hote GitHub epinglees. 'accept-new' acceptait n'importe quelle cle au
# premier contact, donc un MITM possible sur le premier deploiement. Si GitHub
# fait tourner ses cles, le deploiement echoue et il faut rafraichir ce bloc:
#   curl -s https://api.github.com/meta | jq -r '.ssh_keys[]'
GITHUB_KNOWN_HOSTS="${DEPLOY_HOME}/.ssh/known_hosts_github"
mkdir -p "${DEPLOY_HOME}/.ssh"
chmod 700 "${DEPLOY_HOME}/.ssh"
cat > "${GITHUB_KNOWN_HOSTS}" <<'GITHUB_KEYS'
github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl
github.com ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBEmKSENjQEezOmxkZMy7opKgwFB9nkt5YRrYMjNuG5N87uRgg6CLrbo5wAdT/y6v0mKV0U2w0WZ2YB/++Tpockg=
github.com ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCj7ndNxQowgcQnjshcLrqPEiiphnt+VTTvDP6mHBL9j1aNUkY4Ue1gvwnGLVlOhGeYrnZaMgRK6+PKCUXaDbC7qtbW8gIkhL7aGCsOr/C56SJMy/BCZfxd1nWzAOxSDPgVsmerOBYfNqltV9/hWCqBywINIR+5dIg6JTJ72pcEpEjcYgXkE2YEFXV1JHnsKgbLWNlhScqb2UmyRkQyytRLtL+38TGxkxCflmO+5Z8CSSNY7GidjMIZ7Q4zMjA2n1nGrlTDkzwDCsw+wqFPGQA179cnfGWOWRVruj16z6XyvxvjJwbz0wQZ75XK5tKSb7FNyeIEs4TT4jk+S4dhPeAUC5y+bDYirYgM4GC7uEnztnZyaVWQ7B381AK4Qdrwt51ZqExKbQpTUNn+EjqoTwvqNj4kqx5QUCI0ThS/YkOxJCXmPUWZbhjpCg56i+2aB6CmK2JGhn57K5mj0MNdBXA4/WnwH6XoPWJzK5Nyu2zB3nAZp+S5hpQs+p1vN1/wsjk=
GITHUB_KEYS
chmod 600 "${GITHUB_KNOWN_HOSTS}"

export GIT_SSH_COMMAND="ssh -i ${GIT_SSH_IDENTITY_FILE} -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=${GITHUB_KNOWN_HOSTS}"

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
