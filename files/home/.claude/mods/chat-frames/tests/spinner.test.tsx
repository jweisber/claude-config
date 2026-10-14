import { expect, test } from 'claude-code/testing'

test('spinner draws the dots glyph and the word', async $ => {
  const ui = await $.ui.mount({
    plugin: 'chat-frames',
    surface: 'terminal',
    component: 'Spinner',
    props: { word: 'Thinking', message: null, suffix: '…', mode: 'thinking' },
  })
  expect(await ui.find({ type: 'Text', text: /Thinking…/ })).toBeDefined()
  expect(await ui.find({ type: 'Client' })).toBeDefined()
  await ui.unmount()
})
