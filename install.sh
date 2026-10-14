#!/usr/bin/env bash
# Installs this Claude Code look into the current user's Claude config folder.
# Safe to run again: links are refreshed and settings merged, not replaced.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
STAMP="$(date +%Y%m%d-%H%M%S)"

# Point $2 at $1, moving aside anything real that is already there.
link() {
  local src="$1" dst="$2"
  if [ -e "$dst" ] && [ ! -L "$dst" ]; then
    mv "$dst" "$dst.bak-$STAMP"
    echo "moved existing $dst to $dst.bak-$STAMP"
  fi
  ln -sfn "$src" "$dst"
}

mkdir -p "$CONFIG/themes"
chmod +x "$REPO/statusline.py"
link "$REPO/statusline.py" "$CONFIG/statusline.py"
link "$REPO/themes/catppuccin-mocha.json" "$CONFIG/themes/catppuccin-mocha.json"
link "$REPO/mods" "$CONFIG/mods"

# Merge settings.json into the user's settings, keeping everything else they have.
python3 - "$REPO/settings.json" "$CONFIG/settings.json" "$CONFIG" <<'PY'
import json, os, sys

fragment_path, settings_path, config = sys.argv[1:]
with open(fragment_path) as f:
    fragment = json.load(f)
fragment["statusLine"]["command"] = os.path.join(config, "statusline.py")

settings = {}
if os.path.exists(settings_path):
    with open(settings_path) as f:
        settings = json.load(f)
settings.update(fragment)

with open(settings_path, "w") as f:
    json.dump(settings, f, indent=2)
    f.write("\n")
PY
echo "merged settings into $CONFIG/settings.json"

# The mods are a local plugin marketplace, registered through the link so that
# edits in the repo load with /reload-plugins.
if command -v claude >/dev/null; then
  claude plugin marketplace add "$CONFIG/mods" || true
  for mod in sidebar chat-frames; do
    claude plugin install "$mod@local-mods" --scope user || true
  done
else
  echo "claude is not on PATH: install Claude Code, then run this script again"
fi

echo "done: start claude (or run /reload-plugins in a running session)"
