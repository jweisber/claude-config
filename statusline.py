#!/usr/bin/env python3
"""Quiet Catppuccin Mocha status line for Claude Code, in the style of OpenCode.

Left:  model + effort | folder | git branch, dirty, ahead/behind
Right: context used | 5-hour limit (the weekly limit and cache are in the sidebar)
"""
import json
import os
import re
import subprocess
import sys
import time

# Catppuccin Mocha
TEXT = (205, 214, 244)
SUBTEXT = (166, 173, 200)
SUBTEXT1 = (186, 194, 222)
OVERLAY = (127, 132, 156)
SURFACE = (88, 91, 112)
BLUE = (137, 180, 250)
LAVENDER = (180, 190, 254)
YELLOW = (249, 226, 175)
PEACH = (250, 179, 135)
RED = (243, 139, 168)

I_BRANCH = "\ue0a0"
# The one separator, between groups; parts within a group just sit side by side.
DOT = " " + "\033[38;2;69;71;90m" + "·" + "\033[0m" + " "

FIVE_H, SEVEN_D = 5 * 3600, 7 * 86400


def fg(c): return "\033[38;2;%d;%d;%dm" % c
def bg(c): return "\033[48;2;%d;%d;%dm" % c
RESET = "\033[0m"


def visible_len(s):
    return len(re.sub(r"\033\[[0-9;]*m", "", s))


def terminal_width():
    """Find the terminal Claude Code is drawing in by walking up to an ancestor with a tty."""
    pid = os.getpid()
    for _ in range(12):
        for fd in (0, 1, 2):
            try:
                target = os.readlink("/proc/%d/fd/%d" % (pid, fd))
            except OSError:
                continue
            if target.startswith(("/dev/pts/", "/dev/tty")):
                try:
                    with open(target) as tty:
                        return os.get_terminal_size(tty.fileno()).columns
                except OSError:
                    pass
        try:
            with open("/proc/%d/stat" % pid) as f:
                pid = int(f.read().rsplit(")", 1)[1].split()[1])
        except (OSError, ValueError, IndexError):
            break
        if pid <= 1:
            break
    return None


def git(cwd, *args):
    try:
        out = subprocess.run(["git", "-C", cwd, *args], capture_output=True, text=True, timeout=1)
        return out.stdout.strip() if out.returncode == 0 else ""
    except Exception:
        return ""


def short_duration(seconds):
    seconds = max(0, int(seconds))
    if seconds >= 86400:
        return "%dd%dh" % (seconds // 86400, seconds % 86400 // 3600)
    if seconds >= 3600:
        return "%dh%02dm" % (seconds // 3600, seconds % 3600 // 60)
    return "%dm" % max(1, seconds // 60)


def pace_color(used, resets_at, window, now):
    """Color a limit by where the current rate would leave it at reset."""
    remaining = resets_at - now
    if used is None or remaining <= 0 or remaining >= window:
        return None
    if used >= 90:
        return RED
    if used < 10:
        return None
    projected = used / (1 - remaining / window)
    return RED if projected >= 100 else YELLOW if projected >= 90 else None


def fmt_tokens(n):
    if n >= 1_000_000:
        return "%.1fM" % (n / 1_000_000)
    if n >= 1000:
        return "%.1fK" % (n / 1000) if n < 10_000 else "%dK" % round(n / 1000)
    return str(n)


def item(value, label=None, color=None):
    """A value in soft text (or a warning color) with an optional dim label after it."""
    out = fg(color or SUBTEXT) + value
    if label:
        out += fg(OVERLAY) + " " + label
    return out + RESET


def main():
    raw = sys.stdin.read()
    home = os.path.expanduser("~")
    try:
        config = os.environ.get("CLAUDE_CONFIG_DIR") or os.path.join(home, ".claude")
        with open(os.path.join(config, "statusline-last.json"), "w") as f:
            f.write(raw)
    except OSError:
        pass
    try:
        d = json.loads(raw)
    except ValueError:
        return

    now = time.time()
    left, right = [], []

    # Model and effort, like OpenCode's "Plan · Cat Jam Free"
    model = (d.get("model") or {}).get("display_name") or ""
    model = re.sub(r"\s*\(.*?\)", "", model)
    effort = (d.get("effort") or {}).get("level")
    if model:
        left.append(fg(LAVENDER) + model + (" " + fg(YELLOW) + effort if effort else "") + RESET)

    # Folder and git
    cwd = (d.get("workspace") or {}).get("current_dir") or d.get("cwd") or ""
    if cwd:
        short = "~" + cwd[len(home):] if cwd.startswith(home) else cwd
        left.append(fg(OVERLAY) + short + RESET)
        branch = git(cwd, "symbolic-ref", "--short", "HEAD") or git(cwd, "rev-parse", "--short", "HEAD")
        if branch:
            label = I_BRANCH + " " + branch
            if git(cwd, "status", "--porcelain"):
                label += "*"
            counts = git(cwd, "rev-list", "--left-right", "--count", "@{upstream}...HEAD").split()
            if len(counts) == 2:
                behind, ahead = counts
                if ahead != "0":
                    label += " ↑" + ahead
                if behind != "0":
                    label += " ↓" + behind
            left.append(fg(OVERLAY) + label + RESET)

    # Context, like OpenCode's "4.9K (2%)"
    cw = d.get("context_window") or {}
    ctx = cw.get("used_percentage")
    if ctx is not None:
        pct = int(ctx)
        usage = cw.get("current_usage") or {}
        used_tokens = sum(usage.get(k) or 0 for k in (
            "input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"))
        warn = RED if pct >= 90 else PEACH if pct >= 75 else YELLOW if pct >= 50 else None
        text = "%s (%d%%)" % (fmt_tokens(used_tokens), pct) if used_tokens else "%d%%" % pct
        right.append(item(text, None, warn))

    # Subscription limits: a value, then a dim label
    limits = d.get("rate_limits") or {}
    # The weekly limit and the prompt cache live in the sidebar mod.
    for key, name, window in (("five_hour", "5h", FIVE_H),):
        w = limits.get(key) or {}
        used, resets = w.get("used_percentage"), w.get("resets_at")
        if used is None:
            continue
        label = name
        if resets:
            label += " (" + short_duration(resets - now) + ")"
        right.append(item("%d%%" % used, label, pace_color(used, resets or 0, window, now)))

    l_str = DOT.join(left)
    r_str = DOT.join(right)
    width = terminal_width()
    gap = 2
    if width:
        # Claude Code gives the status line the terminal width less 4 columns.
        gap = max(2, width - 4 - visible_len(l_str) - visible_len(r_str))
    sys.stdout.write(l_str + " " * gap + r_str)


if __name__ == "__main__":
    main()
