import type { Register } from 'claude-code'

// OpenCode-style transcript. Theme keys, so it follows the active theme
// (Catppuccin Mocha: blue bar on a mantle panel for you, plain indented
// text for Claude, a dim model · duration footer under long turns).
const USER_BAR = 'professionalBlue'
const USER_BG = 'userMessageBackground'
const ACCENT = 'professionalBlue'
const SPINNER = 'chromeYellow'
const INDENT = 3
// Space between the window edges and everything this mod draws.
const GUTTER = 2
// Three-eighths block, as thick as OpenCode's bar; enough rows for any message.
const BAR = Array(500).fill('▍').join('\n')

const fmtDuration = (ms: number) => {
  const s = Math.round(ms / 1000)
  if (s < 1) return `${ms}ms`
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

export const register: Register = on => {
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (e.props.origin.kind !== 'composer' || e.surface !== 'terminal') return next(e)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box paddingX={GUTTER} marginTop={1} width="100%">
        <Box
          position="relative"
          overflow="hidden"
          backgroundColor={USER_BG}
          paddingLeft={INDENT}
          paddingRight={INDENT - 1}
          paddingY={1}
          flexGrow={1}
        >
          {/* The bar: a tall column of ▍ pinned left, clipped to the panel's height. */}
          <Box position="absolute" top={0} left={0} width={1} overflow="hidden">
            <Text color={USER_BAR}>{BAR}</Text>
          </Box>
          <Text>{e.props.text}</Text>
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.props.isSummary || e.surface !== 'terminal') return next(e)
    const { Box, Markdown } = $.ui.resolve(e)

    return (
      <Box
        paddingLeft={GUTTER + INDENT}
        paddingRight={GUTTER + 1}
        marginTop={e.props.isFirstOfReply ? 1 : 0}
        width="100%"
      >
        <Markdown text={e.props.text} />
      </Box>
    )
  })

  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const model = await $.session.model().then(
      m => m.replace(/\s*\(.*?\)/g, ''),
      () => '',
    )

    return (
      <Box paddingLeft={GUTTER + INDENT} marginTop={1}>
        <Text>
          {model ? <Text color={ACCENT}>{model}</Text> : null}
          <Text dimColor>
            {model ? ' · ' : ''}
            {fmtDuration(e.props.durationMs)}
          </Text>
        </Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const { Box, Text, Client } = $.ui.resolve(e)

    return (
      <Box paddingLeft={GUTTER + INDENT} marginTop={1} flexDirection="row">
        <Client key="glyph" module="./spinner-glyph.tsx" props={{ color: SPINNER }} width={1} />
        <Text color={SPINNER}>
          {' '}
          {e.props.message ?? e.props.word}
          {e.props.suffix}
        </Text>
      </Box>
    )
  })
}
