# claude-config

An OpenCode-style look for the Claude Code terminal UI, in Catppuccin Mocha.

Everything lives in `files/home/.claude/`, laid out as it lands in `~/.claude`:

- **Theme** (`themes/catppuccin-mocha.json`): Catppuccin Mocha colors, with a lavender prompt border.
- **Status line** (`statusline.py`): model and effort, folder and git branch on the left; context used and the 5-hour limit on the right.
- **Mods** (`mods/`), a local plugin marketplace:
  - `sidebar`: context, weekly limit and prompt cache, activity, modified files and to-dos. `/sidebar` toggles it; `/sidebar open` and `/sidebar close` also work.
  - `chat-frames`: framed prompts, indented replies, a braille spinner.
- **Settings** (`claude-config/settings.json`): the theme, the status line, no spinner tips, and "Thinking" as the only spinner verb. `claude-config/setup.sh` merges them into `~/.claude/settings.json` without touching anything else, and installs the two mods.

## Install in a Docker sandbox

The repo is a [Docker Sandboxes kit](https://docs.docker.com/ai/sandboxes/customize/kits-v2/) (`spec.yaml`). Pass it when creating a sandbox, as a local folder or from GitHub:

```sh
sbx run claude --kit ~/claude-config
sbx run claude --kit "git+https://github.com/jweisber/claude-config.git"
```

The files are copied in and `setup.sh` runs before Claude Code starts, so the first session already has the look. `setup.sh` runs again on each start, which costs nothing once everything is in place.

## Install anywhere else

Needs Claude Code and `python3`, plus a Nerd Font in the terminal. This overwrites any files of the same name in `~/.claude`.

```sh
git clone https://github.com/jweisber/claude-config ~/claude-config
cp -r ~/claude-config/files/home/.claude/. ~/.claude/
sh ~/.claude/claude-config/setup.sh
```

## Changing things

Edit the repo, then create a new sandbox (or copy the changed files into `~/.claude` again).

In a running session, with the files in place:

- **Mods:** run `/reload-plugins`.
- **Theme:** restart Claude Code.
- **Status line:** picked up on its next refresh.

Check a mod with `claude plugin validate files/home/.claude/mods/<name>` and `claude plugin test files/home/.claude/mods/<name>`.
