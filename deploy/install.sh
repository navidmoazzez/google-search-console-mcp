#!/usr/bin/env sh
# Install and sign in, for anyone who would rather run one command.
#
#   sh -c "$(curl -fsSL https://raw.githubusercontent.com/navidmoazzez/google-search-console-mcp/main/deploy/install.sh)"
#
# It needs GSC_CLIENT_ID and GSC_CLIENT_SECRET in the environment. Getting those
# is the Google Cloud part, and there is no way to script it:
# https://github.com/navidmoazzez/google-search-console-mcp/blob/main/references/setup.md

set -eu

PKG="@thenavidm/google-search-console-mcp@latest"

if ! command -v node >/dev/null 2>&1; then
  echo "Node 20 or newer is required. https://nodejs.org" >&2
  exit 1
fi

MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$MAJOR" -lt 20 ]; then
  echo "Node 20 or newer is required, found $(node -v)." >&2
  exit 1
fi

if [ -z "${GSC_CLIENT_ID:-}" ] || [ -z "${GSC_CLIENT_SECRET:-}" ]; then
  echo "Set GSC_CLIENT_ID and GSC_CLIENT_SECRET first." >&2
  echo "Both come from a Desktop OAuth client in Google Cloud. The setup guide" >&2
  echo "walks through creating one:" >&2
  echo "https://github.com/navidmoazzez/google-search-console-mcp/blob/main/references/setup.md" >&2
  exit 1
fi

echo "Signing in..."
npx -y "$PKG" login

echo
npx -y "$PKG" doctor
