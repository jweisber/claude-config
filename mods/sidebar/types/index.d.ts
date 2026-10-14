export type Usage = { tokens: number; window: number; percent: number; startedAt: number }
export type EditedFile = { path: string; added: number; removed: number }
export type Todo = { id?: string; content: string; status: 'pending' | 'in_progress' | 'completed' }
export type Running = { id: string; tool: string; detail: string; startedAt: number }
export type Limit = { kind: string; percent: number; resetsAt: number | null }
export type Cache = { expiresAt: number; warm: boolean }
export type AgentRun = { id: string; label: string; type: string; startedAt: number; endedAt: number | null }

declare module 'claude-code' {
  interface PluginState {
    sidebar: {
      usage: Usage | null
      files: EditedFile[]
      todos: Todo[]
      running: Running[]
      counts: Record<string, number>
      agents: AgentRun[]
      compactions: number
      now: number
      limits: Limit[]
      cache: Cache | null
    }
  }
}
