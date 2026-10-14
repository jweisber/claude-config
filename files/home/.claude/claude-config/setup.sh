#!/bin/sh
# Run by the kit (spec.yaml) when the sandbox is created ("install") and on
# every start ("startup"). Merges this look's settings into
# ~/.claude/settings.json, keeping everything else there, and installs the
# mods. Safe to run any number of times. Logs to setup.log beside it.
set -eu

CONFIG="$HOME/.claude"
HERE="$CONFIG/claude-config"

exec >>"$HERE/setup.log" 2>&1
echo "== $(date -u +%FT%TZ) ${1:-manual} uid=$(id -u) claude=$(command -v claude || echo none)"

python3 - "$HERE/settings.json" "$CONFIG/settings.json" "$CONFIG/mods" <<'PY'
import json, os, sys

fragment_path, settings_path, mods = sys.argv[1:]
with open(fragment_path) as f:
    fragment = json.load(f)
fragment["extraKnownMarketplaces"] = {
    "local-mods": {"source": {"source": "directory", "path": mods}}
}

settings = {}
if os.path.exists(settings_path):
    with open(settings_path) as f:
        settings = json.load(f)
print("settings.json had:", ", ".join(sorted(settings)) or "nothing")

merged = dict(settings)
for key, value in fragment.items():
    # Merge maps one level down so other plugins and marketplaces stay.
    if isinstance(value, dict) and key in ("enabledPlugins", "extraKnownMarketplaces"):
        merged[key] = {**settings.get(key, {}), **value}
    else:
        merged[key] = value
if merged == settings:
    sys.exit(0)

tmp = settings_path + ".tmp"
with open(tmp, "w") as f:
    json.dump(merged, f, indent=2)
    f.write("\n")
os.replace(tmp, settings_path)
print("merged settings")
PY

# Installing the mods is slow, so it is skipped once Claude Code has both.
installed="$CONFIG/plugins/installed_plugins.json"
if ! grep -q '"sidebar@local-mods"' "$installed" 2>/dev/null ||
   ! grep -q '"chat-frames@local-mods"' "$installed" 2>/dev/null; then
  claude plugin marketplace add "$CONFIG/mods" || true
  for mod in sidebar chat-frames; do
    claude plugin install "$mod@local-mods" --scope user || true
  done
fi
echo "done"
