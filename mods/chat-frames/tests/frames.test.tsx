import { expect, test } from 'claude-code/testing'

test('prompts draw in a panel, replies indented, footer restyled', async $ => {

  const user = await $.ui.mount({
    plugin: 'chat-frames',
    surface: 'terminal',
    component: 'UserMessage',
    props: { text: 'hello there', origin: { kind: 'composer' }, isExpanded: true },
  })
  expect(await user.find({ type: 'Text', text: /hello there/ })).toBeDefined()
  await user.unmount()

  const reply = await $.ui.mount({
    plugin: 'chat-frames',
    surface: 'terminal',
    component: 'AssistantMessage',
    props: { text: '**Hi!** How can I help?', isFirstOfReply: true },
  })
  expect(await reply.find({ type: 'Markdown' })).toBeDefined()
  await reply.unmount()

  const footer = await $.ui.mount({
    plugin: 'chat-frames',
    surface: 'terminal',
    component: 'TurnDuration',
    props: { word: 'Baked', durationMs: 12_400 },
  })
  expect(await footer.find({ type: 'Text', text: /12s/ })).toBeDefined()
  await footer.unmount()
})
