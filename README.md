# claude-config

An OpenCode-style look for the Claude Code terminal UI, in Catppuccin Mocha.

- **Theme** (`themes/catppuccin-mocha.json`): Catppuccin Mocha colors, with a lavender prompt border.
- **Status line** (`statusline.py`): model and effort, folder and git branch on the left; context used and the 5-hour limit on the right.
- **Mods** (`mods/`), a local plugin marketplace:
  - `sidebar`: context, weekly limit and prompt cache, activity, modified files and to-dos. `/sidebar` toggles it; `/sidebar open` and `/sidebar close` also work.
  - `chat-frames`: framed prompts, indented replies, a braille spinner.
- **Settings** (`settings.json`): the theme, the status line, no spinner tips, and "Thinking" as the only spinner verb.

## Install

Needs Claude Code, `python3` and `git`, plus a Nerd Font in the terminal.

```sh
git clone https://github.com/jweisber/claude-config ~/claude-config
~/claude-config/install.sh
```

The script links the theme, status line and mods into `~/.claude` (or `$CLAUDE_CONFIG_DIR`), merges `settings.json` into your settings without touching anything else, and installs the two mods. Anything already in the way is moved aside to `<name>.bak-<date>`. It is safe to run again.

## Changing things

Because everything is linked, edit the files in the repo:

- **Mods:** run `/reload-plugins` in a running session.
- **Theme:** restart Claude Code.
- **Status line:** picked up on its next refresh.

Check a mod with `claude plugin validate mods/<name>` and `claude plugin test mods/<name>`.

To update another machine, run `git pull` there.
