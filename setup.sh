#!/usr/bin/env bash
# Developer/runner setup for macOS, Linux and WSL / Git Bash: makes sure Node
# 26 is available (installing it with fnm when it is not), then installs the
# client's packages. Safe to run again.
#   ./setup.sh && cd client && npm run dev
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

need="$(tr -d 'v \n' < .nvmrc)"
have_node() { command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge "${need%%.*}" ]; }

echo "==> Node ${need}"
if have_node; then
  echo "found node $(node --version)"
else
  export PATH="$HOME/.local/share/fnm:$HOME/.fnm:$PATH"
  if ! command -v fnm >/dev/null 2>&1; then
    command -v curl >/dev/null 2>&1 || { echo "curl is needed to install fnm (or install Node ${need}+ yourself: https://nodejs.org)"; exit 1; }
    curl -fsSL https://fnm.vercel.app/install | bash -s -- --skip-shell
    export PATH="$HOME/.local/share/fnm:$HOME/.fnm:$PATH"
  fi
  eval "$(fnm env)"
  fnm install "${need}"
  fnm use "${need}"
  echo "installed node $(node --version) with fnm"
  echo "for your own terminals: add  eval \"\$(fnm env --use-on-cd)\"  to your shell profile (~/.zshrc or ~/.bashrc)"
fi

echo "==> Packages"
(cd client && npm ci)

cat <<'EOF2'

Ready. Next:
  1. start ubiquitous-server (its README: ./run.sh start, or just dev)
  2. cd client && npm run dev
  3. open http://localhost:8780 and choose your .ipa
EOF2
