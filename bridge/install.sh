#!/usr/bin/env bash
# Install the Hermes Mobile channel into Hermes and turn it on for one profile.
#
#   ./install.sh                 # default profile, port 8765
#   ./install.sh coder 8766      # profile "coder" on port 8766 (one port per profile)
#
# Safe to re-run: it updates the plugin files and only sets the values below.
set -euo pipefail

PROFILE="${1:-default}"
PORT="${2:-8765}"
HERMES_ROOT="${HERMES_ROOT:-$HOME/.hermes}"
SRC="$(cd "$(dirname "$0")" && pwd)/hermes_mobile"
DEST="$HERMES_ROOT/plugins/hermes_mobile"

if ! command -v hermes >/dev/null 2>&1; then
  echo "The 'hermes' command was not found. Install Hermes Agent first." >&2
  exit 1
fi

if [ "$PROFILE" = "default" ]; then
  HOME_DIR="$HERMES_ROOT"; H=(hermes)
else
  HOME_DIR="$HERMES_ROOT/profiles/$PROFILE"; H=(hermes -p "$PROFILE")
fi
[ -d "$HOME_DIR" ] || { echo "Profile '$PROFILE' not found at $HOME_DIR" >&2; exit 1; }

echo "→ Copying plugin to $DEST"
mkdir -p "$DEST"
cp "$SRC"/*.py "$SRC"/plugin.yaml "$DEST"/

echo "→ Enabling plugin"
"${H[@]}" plugins enable hermes-mobile >/dev/null 2>&1 || "${H[@]}" plugins enable hermes_mobile || true

set_env() {  # set_env KEY VALUE  -> writes/updates KEY in the profile's .env
  local file="$HOME_DIR/.env"
  touch "$file"; chmod 600 "$file"
  if grep -q "^$1=" "$file"; then
    sed -i.bak "s|^$1=.*|$1=$2|" "$file" && rm -f "$file.bak"
  else
    printf '%s=%s\n' "$1" "$2" >> "$file"
  fi
}

echo "→ Configuring profile '$PROFILE' (port $PORT)"
set_env HERMES_MOBILE_ENABLED true
set_env HERMES_MOBILE_PORT "$PORT"
# Paired-device tokens are the access control for this channel (see README).
set_env HERMES_MOBILE_ALLOW_ALL_USERS true

# Live streaming of answers (this channel only), and structured tool cards instead of emoji progress bubbles.
# Per-platform switch so other channels (WhatsApp, Telegram...) keep their current behaviour.
"${H[@]}" config set display.platforms.hermes_mobile.streaming true >/dev/null || true
"${H[@]}" config set display.platforms.hermes_mobile.tool_progress off >/dev/null || true

echo "→ Restarting the gateway"
"${H[@]}" gateway restart || "${H[@]}" gateway start || true

cat <<EOF

Done. Now pair your phone:

  ${H[*]} mobile pair --name "My phone"
  # or, if that command is not available:
  python3 "$DEST/pair.py" -p $PROFILE pair --name "My phone"

Give a friend this profile only:

  python3 "$DEST/pair.py" -p $PROFILE pair --guest --name "Ahmed"
EOF
