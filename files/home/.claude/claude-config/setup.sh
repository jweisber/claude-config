#!/bin/sh
# Run by the kit (spec.yaml) when the sandbox is created ("install") and on
# every start ("startup"). Merges this look's settings into
# ~/.claude/settings.json, keeping everything else there, and installs the
# mods and jstack. Safe to run any number of times. Logs to setup.log beside it.
set -eu

CONFIG="$HOME/.claude"
HERE="$CONFIG/claude-config"

exec >>"$HERE/setup.log" 2>&1
echo "== $(date -u +%FT%TZ) ${1:-manual} uid=$(id -u) claude=$(command -v claude || echo none)"

# The sandbox image's Claude Code can be too old for the mods, and it only
# updates itself in the background, ready for the next session. Updating
# here, before the first session starts, saves that restart.
if [ "${1:-}" = install ]; then
  timeout 300 claude update || echo "update failed; Claude Code will update itself later"
fi

python3 - "$HERE/settings.json" "$CONFIG/settings.json" "$CONFIG/mods" <<'PY'
import json, os, sys

fragment_path, settings_path, mods = sys.argv[1:]
with open(fragment_path) as f:
    fragment = json.load(f)
fragment.setdefault("extraKnownMarketplaces", {})["local-mods"] = {
    "source": {"source": "directory", "path": mods}
}

settings = {}
if os.path.exists(settings_path):
    with open(settings_path) as f:
        settings = json.load(f)
print("settings.json had:", ", ".join(sorted(settings)) or "nothing")

merged = dict(settings)
for key, value in fragment.items():
    # Merge maps one level down so other plugins, marketplaces and
    # environment variables stay.
    if isinstance(value, dict) and key in ("enabledPlugins", "extraKnownMarketplaces", "env"):
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

# jstack, the writing skills, installs once from GitHub. After that, Claude
# Code's auto-update for the marketplace pulls new commits in each session.
# marketplace add may drop autoUpdate from settings.json; the merge above
# restores it on the next run.
if ! grep -q '"jstack@jstack"' "$installed" 2>/dev/null; then
  export CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1
  claude plugin marketplace add jweisber/jstack || true
  claude plugin install jstack@jstack --scope user || true
fi
echo "done"
