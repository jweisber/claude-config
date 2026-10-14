import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentRun, Cache, EditedFile, Limit, Running, Todo, Usage } from '../types'

const PANE = 'sidebar'
const TITLE = 'Session'
// OpenCode's sidebar is about 42 columns wide.
const WIDTH = 42
const usage = atom({ plugin: 'sidebar', key: 'usage' } as const, null)
const files = atom({ plugin: 'sidebar', key: 'files' } as const, [])
const todos = atom({ plugin: 'sidebar', key: 'todos' } as const, [])
const running = atom({ plugin: 'sidebar', key: 'running' } as const, [])
const counts = atom({ plugin: 'sidebar', key: 'counts' } as const, {})
const agents = atom({ plugin: 'sidebar', key: 'agents' } as const, [])
const compactions = atom({ plugin: 'sidebar', key: 'compactions' } as const, 0)
const now = atom({ plugin: 'sidebar', key: 'now' } as const, 0)
const limits = atom({ plugin: 'sidebar', key: 'limits' } as const, [])
const cache = atom({ plugin: 'sidebar', key: 'cache' } as const, null)

// Nerd Font glyphs
const I_CLOCK = '\u{f0954}'
const I_RUN = '\u{f04b}'
const I_DONE = '\u{f00c}'
const I_AGENT = '\u{f06a9}'
const I_COMPACT = '\u{f0e76}'
const I_WEEK = '\uf073'
const I_IDLE = '\uf04c'
const I_CACHE = '\uf017'

// Lines in a text, not counting the empty piece after a final newline.
const splitLines = (s: string | undefined) => {
  if (!s) return []
  const parts = s.split('\n')
  if (parts[parts.length - 1] === '') parts.pop()
  return parts
}

// Lines an edit adds and removes, leaving out the lines it keeps at either end.
const diffCounts = (before: string | undefined, after: string | undefined) => {
  const a = splitLines(before)
  const b = splitLines(after)
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let end = 0
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++
  return { added: b.length - start - end, removed: a.length - start - end }
}

const fmtTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`

const fmtElapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${s}s`
}

const fmtLeft = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60_000))
  if (m >= 1440) return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`
  return `${Math.max(1, m)}m`
}

const WEEK = 7 * 86_400_000

// Yellow or red when the current pace would use up the window before it resets.
const paceColor = (percent: number, resetsAt: number | null, now: number) => {
  if (percent >= 90) return 'error'
  if (resetsAt === null || percent < 10) return undefined
  const elapsed = 1 - (resetsAt - now) / WEEK
  if (elapsed <= 0 || elapsed >= 1) return undefined
  const projected = percent / elapsed
  return projected >= 100 ? 'error' : projected >= 90 ? 'warning' : undefined
}

const basename = (p: string) => p.split('/').pop() ?? p

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

const shorten = (path: string, root: string) =>
  path.startsWith(root + '/') ? path.slice(root.length + 1) : path

async function refreshUsage($: EngineInterface) {
  const u = await $.session.usage()
  const next: Usage = {
    tokens: u.context.tokens ?? 0,
    window: u.context.window,
    percent: u.context.percent ?? 0,
    startedAt: u.startedAt,
  }
  const windows: Limit[] = u.rateLimits.map(r => ({
    kind: r.kind,
    percent: r.percentUsed,
    resetsAt: r.resetsAt ? Date.parse(r.resetsAt) : null,
  }))
  // Write only on a change, since the clock tick calls this too.
  if (JSON.stringify(await read($, usage)) !== JSON.stringify(next)) await update($, usage, () => next)
  if (JSON.stringify(await read($, limits)) !== JSON.stringify(windows)) await update($, limits, () => windows)
}

// The prompt cache has no API of its own: the status line script leaves each
// session's last input in the Claude config folder, and that carries the cache's expiry.
async function refreshCache($: EngineInterface) {
  const dir = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await $.env.get('HOME')}/.claude`
  const raw = await $.fs.read(`${dir}/statusline/${await $.session.id()}.json`).catch(() => null)
  if (raw === null) return
  let found: Cache | null = null
  try {
    const pc = JSON.parse(raw).prompt_cache
    if (pc?.caching_observed && pc.expires_at) {
      found = { expiresAt: pc.expires_at * 1000, warm: pc.warm !== false }
    }
  } catch {
    return
  }
  const last = await read($, cache)
  if (last?.expiresAt !== found?.expiresAt || last?.warm !== found?.warm) {
    await update($, cache, () => found)
  }
}

async function tick($: EngineInterface) {
  // session.measure fires only after a turn, so /compact and the like show up here.
  await refreshUsage($)
  await refreshCache($)
  const t = await $.clock.now()
  const busy =
    (await read($, agents)).some(a => a.endedAt === null) || (await read($, running)).length > 0
  const last = await read($, now)
  // Redraw every tick while something runs, otherwise once a minute for the session clock.
  if (busy || t - last >= 60_000) await update($, now, () => t)
}

export const register: Register = on => {
  let root = ''

  on('session.start', async ($, e, next) => {
    root = await $.session.root()
    await $.command.register({
      name: 'sidebar',
      description: 'Toggle the session sidebar (context, activity, edited files, to-dos); or /sidebar open|close',
    })
    void $.ui.open({ id: PANE, title: TITLE, columns: WIDTH })
    await refreshUsage($)
    await refreshCache($)
    const t = await $.clock.now()
    await update($, now, () => t)
    $.clock.every(5000, () => tick($))

    return next(e)
  })

  on('command.run', { command: 'sidebar' }, async ($, e) => {
    // `/sidebar` toggles; `/sidebar open` and `/sidebar close` do just that.
    const arg = e.args.trim().toLowerCase()
    const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
    if (arg === 'close' || (arg === '' && isOpen)) {
      await $.ui.close({ id: PANE })

      return { text: 'Sidebar closed.' }
    }
    const { isPlaced } = await $.ui.open({ id: PANE, title: TITLE, columns: WIDTH })

    return {
      text: isPlaced
        ? 'Sidebar opened.'
        : 'Sidebar opened; widen the terminal if it is not showing.',
    }
  })

  on('session.measure', async ($, e, next) => {
    await refreshUsage($)

    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    const done = await next(e)
    if (e.trigger !== 'precompute' && e.agentId === undefined && !('skip' in done && done.skip)) {
      await update($, compactions, n => n + 1).catch(() => {})
      await refreshUsage($).catch(() => {})
    }

    return done
  })

  on('tool.call', async ($, e, next) => {
    const startedAt = await $.clock.now()
    const id = e.tool_use_id ?? `${e.tool}-${startedAt}`

    let detail = ''
    if (e.tool === 'Bash') detail = e.command
    else if (e.tool === 'Read' || e.tool === 'Edit' || e.tool === 'Write') detail = basename(e.file_path)
    else if (e.tool === 'WebFetch') detail = e.url
    else if (e.tool === 'WebSearch') detail = e.query

    const isAgent = e.tool === 'Agent'
    if (e.tool === 'Agent') {
      const run: AgentRun = {
        id,
        label: e.description,
        type: e.subagent_type ?? 'general-purpose',
        startedAt,
        endedAt: null,
      }
      await update($, agents, list => [...list, run].slice(-20)).catch(() => {})
    } else {
      const job: Running = { id, tool: e.tool, detail, startedAt }
      await update($, running, list => [...list, job]).catch(() => {})
    }

    const ran = await next(e)
    const endedAt = await $.clock.now()

    if (isAgent) {
      await update($, agents, list => list.map(a => (a.id === id ? { ...a, endedAt } : a))).catch(
        () => {},
      )
    } else {
      await update($, running, list => list.filter(r => r.id !== id)).catch(() => {})
      await update($, counts, c => ({ ...c, [e.tool]: (c[e.tool] ?? 0) + 1 })).catch(() => {})
    }

    const isFailed = ('deny' in ran && !!ran.deny) || !!ran.isError
    if (isFailed) return ran

    if (e.tool === 'TodoWrite') {
      const list: Todo[] = e.todos.map(td => ({ content: td.content, status: td.status }))
      await update($, todos, () => list).catch(() => {})
    }

    // The task tools (TaskCreate/TaskUpdate/TaskList) keep the same kind of list, by id.
    if (e.tool === 'TaskCreate') {
      const task = (ran.result as { task?: { id: string; subject: string } } | undefined)?.task
      if (task) {
        const added: Todo = { id: task.id, content: task.subject, status: 'pending' }
        await update($, todos, list => [...list.filter(td => td.id !== task.id), added]).catch(() => {})
      }
    } else if (e.tool === 'TaskUpdate') {
      await update($, todos, list =>
        e.status === 'deleted'
          ? list.filter(td => td.id !== e.taskId)
          : list.map(td =>
              td.id === e.taskId
                ? { ...td, content: e.subject ?? td.content, status: e.status ?? td.status }
                : td,
            ),
      ).catch(() => {})
    } else if (e.tool === 'TaskList') {
      const tasks = (ran.result as { tasks?: { id: string; subject: string; status: Todo['status'] }[] } | undefined)?.tasks
      if (tasks) {
        const list: Todo[] = tasks.map(t => ({ id: t.id, content: t.subject, status: t.status }))
        await update($, todos, () => list).catch(() => {})
      }
    }

    let edit: EditedFile | null = null
    if (e.tool === 'Edit') {
      edit = { path: e.file_path, ...diffCounts(e.old_string, e.new_string) }
    } else if (e.tool === 'Write') {
      edit = { path: e.file_path, added: splitLines(e.content).length, removed: 0 }
    }
    if (edit !== null) {
      const done = edit
      await update($, files, list => {
        const found = list.find(f => f.path === done.path)
        const rest = list.filter(f => f.path !== done.path)
        const merged = found
          ? { ...found, added: found.added + done.added, removed: found.removed + done.removed }
          : done

        return [merged, ...rest].slice(0, 50)
      }).catch(() => {})
    }

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const u = await read($, usage)
    const edited = await read($, files)
    const list = await read($, todos)
    const jobs = await read($, running)
    const tally = await read($, counts)
    const runs = await read($, agents)
    const compacted = await read($, compactions)
    const t = await read($, now)
    const windows = await read($, limits)
    const cached = await read($, cache)
    const weekly = windows.find(w => w.kind === 'seven_day')

    // Fill the whole pane with the darker panel color, padded inside.
    const PAD_X = 2
    const PAD_Y = 1
    const paneColumns = e.props.bodyColumns
    const paneRows = e.props.scroll.bodyRows
    const width = Math.max(16, paneColumns - PAD_X * 2)
    const barWidth = Math.min(24, width)
    const pct = u?.percent ?? 0
    const filled = Math.round((pct / 100) * barWidth)
    const barColor = pct >= 90 ? 'error' : pct >= 75 ? 'claude' : pct >= 50 ? 'warning' : 'success'

    const heading = (label: string) => (
      <Text bold color="autoAccept">
        {label}
      </Text>
    )

    const topTools = Object.entries(tally)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
    // Counts sit in one column, two spaces past the longest tool name.
    const nameWidth = Math.max(0, ...topTools.map(([tool]) => tool.length)) + 2
    const liveAgents = runs.filter(a => a.endedAt === null)
    const recentAgents = runs.filter(a => a.endedAt !== null).slice(-3)

    return (
      <Box
        flexDirection="column"
        gap={1}
        width={paneColumns}
        minHeight={paneRows}
        backgroundColor="composerSidebarBackground"
        paddingX={PAD_X}
        paddingY={PAD_Y}
      >
        <Box flexDirection="column">
          {heading('Context')}
          {u === null ? (
            <Text dimColor>Waiting for the first reply…</Text>
          ) : (
            <>
              <Text>
                <Text color={barColor}>{'━'.repeat(filled)}</Text>
                <Text color="subtle">{'━'.repeat(barWidth - filled)}</Text>
              </Text>
              <Text>
                <Text color={barColor}>{pct}%</Text>
                <Text color="subtle">
                  {' '}
                  {fmtTokens(u.tokens)} / {fmtTokens(u.window)}
                </Text>
              </Text>
              <Text>
                <Text color="inactive">{I_COMPACT} </Text>
                {compacted === 0 ? (
                  <Text dimColor>not compacted</Text>
                ) : (
                  <Text>compacted {compacted}×</Text>
                )}
              </Text>
              <Text>
                <Text color="inactive">{I_CLOCK} </Text>
                {fmtElapsed(t - u.startedAt)}
              </Text>
            </>
          )}
        </Box>

        <Box flexDirection="column">
          {heading('Limits')}
          {weekly === undefined && cached === null && <Text dimColor>No readings yet</Text>}
          {weekly !== undefined && (
            <Text wrap="truncate-end">
              <Text color="inactive">{I_WEEK} </Text>
              <Text color={paceColor(weekly.percent, weekly.resetsAt, t)}>{weekly.percent}%</Text>
              <Text dimColor> weekly</Text>
              {weekly.resetsAt !== null ? (
                <Text dimColor> · resets in {fmtLeft(weekly.resetsAt - t)}</Text>
              ) : null}
            </Text>
          )}
          {cached !== null && (
            <Text wrap="truncate-end">
              <Text color="inactive">{I_CACHE} </Text>
              {!cached.warm || cached.expiresAt <= t ? (
                <Text color="error">cold</Text>
              ) : (
                <Text color={cached.expiresAt - t < 300_000 ? 'claude' : undefined}>
                  {fmtLeft(cached.expiresAt - t)}
                </Text>
              )}
              <Text dimColor> cache{cached.warm && cached.expiresAt > t ? ' left' : ''}</Text>
            </Text>
          )}
        </Box>

        <Box flexDirection="column">
          {heading('Activity')}
          {/* One fixed row for what is running now, so nothing below it jumps. */}
          {(() => {
            const job = jobs[jobs.length - 1]
            const agent = liveAgents[liveAgents.length - 1]
            const extra = jobs.length + liveAgents.length - 1
            const more = extra > 0 ? <Text dimColor> +{extra}</Text> : null
            if (agent) {
              return (
                <Text wrap="truncate-end">
                  <Text color="planMode">
                    {I_AGENT} {agent.type}
                  </Text>
                  <Text dimColor>
                    {' '}
                    {agent.label} · {fmtElapsed(t - agent.startedAt)}
                  </Text>
                  {more}
                </Text>
              )
            }
            if (job) {
              return (
                <Text wrap="truncate-end">
                  <Text color="permission">
                    {I_RUN} {job.tool}
                  </Text>
                  {more}
                  {job.detail ? <Text dimColor> {clip(job.detail, width)}</Text> : null}
                </Text>
              )
            }
            return <Text dimColor>{I_IDLE} Idle</Text>
          })()}
          {recentAgents.map(a => (
            <Text key={a.id} wrap="truncate-end" dimColor>
              {I_DONE} {a.type}: {a.label} · {fmtElapsed((a.endedAt ?? t) - a.startedAt)}
            </Text>
          ))}
          {topTools.map(([tool, n]) => (
            <Text key={tool} wrap="truncate-end">
              <Text color="success">{I_DONE}</Text> {tool.padEnd(nameWidth)}
              <Text dimColor>×{n}</Text>
            </Text>
          ))}
        </Box>

        <Box flexDirection="column">
          {heading('Modified files')}
          {edited.length === 0 && <Text dimColor>None yet</Text>}
          {edited.slice(0, 15).map(f => (
            <Box key={f.path} flexDirection="row" justifyContent="space-between">
              <Box flexShrink={1}>
                <Text wrap="truncate-middle">{shorten(f.path, root)}</Text>
              </Box>
              <Box flexShrink={0} marginLeft={1}>
                <Text wrap="truncate-end">
                  <Text color="success">+{f.added}</Text> <Text color="error">-{f.removed}</Text>
                </Text>
              </Box>
            </Box>
          ))}
        </Box>

        <Box flexDirection="column">
          {heading('To-do')}
          {list.length === 0 && <Text dimColor>No to-dos</Text>}
          {list.map((td, i) => (
            <Text
              key={`${i}`}
              wrap="truncate-end"
              color={td.status === 'in_progress' ? 'permission' : undefined}
              dimColor={td.status === 'completed'}
              strikethrough={td.status === 'completed'}
            >
              {td.status === 'completed' ? '✓' : td.status === 'in_progress' ? '▸' : '○'} {td.content}
            </Text>
          ))}
        </Box>
      </Box>
    )
  })
}
