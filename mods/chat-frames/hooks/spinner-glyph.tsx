import type { ClientModule } from 'claude-code'

// OpenCode-style dots circling a braille cell.
const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const FRAME_MS = 80

type Props = { color: string }

const SpinnerGlyph: ClientModule<Props, number> = (props, surface) => {
  const { Text } = surface.elements
  if (surface.state === undefined) {
    surface.setState(0)
    surface.every(FRAME_MS, () => surface.setState(((surface.state ?? 0) + 1) % FRAMES.length))
  }

  return <Text color={props.color}>{FRAMES[surface.state ?? 0]}</Text>
}

export default SpinnerGlyph
