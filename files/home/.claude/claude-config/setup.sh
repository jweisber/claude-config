#!/bin/sh
# Run by the kit (spec.yaml) when the sandbox is created and on every start.
# Merges this look's settings into ~/.claude/settings.json, keeping everything
# else there, and registers the mods. Safe to run any number of times.
set -eu

CONFIG="$HOME/.claude"
HERE="$CONFIG/claude-config"

python3 - "$HERE/settings.json" "$CONFIG/settings.json" <<'PY'
import json, os, sys

fragment_path, settings_path = sys.argv[1:]
with open(fragment_path) as f:
    fragment = json.load(f)

settings = {}
if os.path.exists(settings_path):
    with open(settings_path) as f:
        settings = json.load(f)
if all(settings.get(k) == v for k, v in fragment.items()):
    sys.exit(0)
settings.update(fragment)

tmp = settings_path + ".tmp"
with open(tmp, "w") as f:
    json.dump(settings, f, indent=2)
    f.write("\n")
os.replace(tmp, settings_path)
PY

# The mods are a local plugin marketplace. Registering them is slow, so it is
# skipped once Claude Code has both installed.
installed="$CONFIG/plugins/installed_plugins.json"
if ! grep -q '"sidebar@local-mods"' "$installed" 2>/dev/null ||
   ! grep -q '"chat-frames@local-mods"' "$installed" 2>/dev/null; then
  claude plugin marketplace add "$CONFIG/mods" || true
  for mod in sidebar chat-frames; do
    claude plugin install "$mod@local-mods" --scope user || true
  done
fi
