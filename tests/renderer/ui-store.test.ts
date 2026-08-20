import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUIStore } from '../../src/renderer/stores/ui.store'

describe('UI store', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true)
  })

  it('starts with the Pivot workbench defaults', () => {
    const state = useUIStore.getState()

    expect({
      chatSubmode: state.chatSubmode,
      isAgentPanelCollapsed: state.isAgentPanelCollapsed,
      isConversationSidebarCollapsed: state.isConversationSidebarCollapsed,
      reasoningEffort: state.reasoningEffort,
      rightPanelWidth: state.rightPanelWidth,
      sessionView: state.sessionView,
      sidebarWidth: state.sidebarWidth,
      theme: state.theme,
      workspaceActivity: state.workspaceActivity,
    }).toEqual({
      chatSubmode: 'agent',
      isAgentPanelCollapsed: false,
      isConversationSidebarCollapsed: false,
      reasoningEffort: 3,
      rightPanelWidth: 360,
      sessionView: 'editor',
      sidebarWidth: 280,
      theme: 'light',
      workspaceActivity: 'files',
    })
    expect(state).not.toHaveProperty('mode')
    expect(state).not.toHaveProperty('setMode')
    expect(state).not.toHaveProperty('toggleMode')
  })

  it('updates each workbench preference through its setter', () => {
    const initial = useUIStore.getState()

    initial.setWorkspaceActivity('agent')
    initial.setSessionView('terminal')
    initial.setChatSubmode('chat')
    initial.setReasoningEffort(5)
    initial.setConversationSidebarCollapsed(true)
    initial.setAgentPanelCollapsed(true)

    const updated = useUIStore.getState()
    expect(updated).not.toBe(initial)
    expect({
      chatSubmode: updated.chatSubmode,
      isAgentPanelCollapsed: updated.isAgentPanelCollapsed,
      isConversationSidebarCollapsed: updated.isConversationSidebarCollapsed,
      reasoningEffort: updated.reasoningEffort,
      sessionView: updated.sessionView,
      workspaceActivity: updated.workspaceActivity,
    }).toEqual({
      chatSubmode: 'chat',
      isAgentPanelCollapsed: true,
      isConversationSidebarCollapsed: true,
      reasoningEffort: 5,
      sessionView: 'terminal',
      workspaceActivity: 'agent',
    })
    expect({
      chatSubmode: initial.chatSubmode,
      isAgentPanelCollapsed: initial.isAgentPanelCollapsed,
      isConversationSidebarCollapsed: initial.isConversationSidebarCollapsed,
      reasoningEffort: initial.reasoningEffort,
      sessionView: initial.sessionView,
      workspaceActivity: initial.workspaceActivity,
    }).toEqual({
      chatSubmode: 'agent',
      isAgentPanelCollapsed: false,
      isConversationSidebarCollapsed: false,
      reasoningEffort: 3,
      sessionView: 'editor',
      workspaceActivity: 'files',
    })
  })

  it('marks a user-selected theme as explicit', () => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    })
    try {
      useUIStore.getState().setTheme('dark')

      expect(values.get('pivot:theme')).toBe('dark')
      expect(values.get('pivot:theme-explicit')).toBe('1')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('toggles the conversation sidebar and Agent panel independently', () => {
    const initial = useUIStore.getState()

    initial.toggleConversationSidebar()
    let updated = useUIStore.getState()
    expect(updated.isConversationSidebarCollapsed).toBe(true)
    expect(updated.isAgentPanelCollapsed).toBe(false)
    expect(initial.isConversationSidebarCollapsed).toBe(false)

    updated.toggleAgentPanel()
    updated = useUIStore.getState()
    expect(updated.isConversationSidebarCollapsed).toBe(true)
    expect(updated.isAgentPanelCollapsed).toBe(true)

    updated.toggleConversationSidebar()
    updated.toggleAgentPanel()
    expect(useUIStore.getState()).toMatchObject({
      isAgentPanelCollapsed: false,
      isConversationSidebarCollapsed: false,
    })
  })

  it('keeps view preferences narrow instead of storing a second top-level navigation state', () => {
    const state = useUIStore.getState()

    state.setSessionView('preview')
    state.setWorkspaceActivity('timeline')

    expect(useUIStore.getState()).toMatchObject({
      sessionView: 'preview',
      workspaceActivity: 'timeline',
    })
    expect(useUIStore.getState()).not.toHaveProperty('mode')
  })
})
