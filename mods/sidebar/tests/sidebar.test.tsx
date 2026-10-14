import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  component: 'Pane',
  requestId: 'sidebar',
  props: {
    title: 'Session',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

test('sidebar draws its sections and tracks to-dos and edits', async ($, on) => {
  mock.clock(on)
  on('tool.call', () => ({ result: 'ok' }))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'sidebar', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /Context/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Modified files/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /No to-dos/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Idle/ })).toBeDefined()
    await ui.unmount()
  }

  await $.tool.call({
    tool: 'TodoWrite',
    todos: [{ content: 'Write the sidebar', status: 'in_progress', activeForm: 'Writing' }],
  })
  await $.tool.call({ tool: 'Write', file_path: '/tmp/x/a.ts', content: 'one\ntwo' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.tool.call({ tool: 'Bash', command: 'pwd' })
  await $.tool.call({
    tool: 'Agent',
    description: 'Find auth code',
    prompt: 'look',
    subagent_type: 'Explore',
  })

  const ui = await $.ui.mount({ plugin: 'sidebar', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /Write the sidebar/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /a\.ts/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\+2/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /×2/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Explore: Find auth code/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\$/ })).toBeUndefined()
  await ui.unmount()
})

test('sidebar tracks the task tools', async ($, on) => {
  mock.clock(on)
  let next = 0
  on('tool.call', { tool: 'TaskCreate' }, (_$, e) => ({
    result: { task: { id: String(++next), subject: e.subject } },
  }))
  on('tool.call', () => ({ result: { success: true } }))

  await $.tool.call({ tool: 'TaskCreate', subject: 'Plan it', description: 'x' })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Ship it', description: 'y' })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Drop it', description: 'z' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'in_progress' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '3', status: 'deleted' })

  const ui = await $.ui.mount({ plugin: 'sidebar', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /✓ Plan it/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /▸ Ship it/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Drop it/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /No to-dos/ })).toBeUndefined()
  await ui.unmount()
})
