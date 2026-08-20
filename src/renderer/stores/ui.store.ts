import { create } from 'zustand'
import type { ApplicationTheme } from '../../shared/application-preferences'
import { DEFAULT_PREVIEW_URL, normalizePreviewUrl } from '../../shared/preview-url'
import type { SessionView } from '../navigation/pivot-navigation'

export type ThemeMode = ApplicationTheme
export type WorkspaceActivity = 'sessions' | 'files' | 'agent' | 'plan' | 'timeline' | 'skills'
export type ChatSubmode = 'chat' | 'agent' | 'preview' | 'terminal'
export type PreviewDevice = 'desktop' | 'tablet' | 'mobile'
export type ReasoningEffort = 1 | 2 | 3 | 4 | 5

function initialTheme(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'light'
  if (localStorage.getItem('pivot:theme-explicit') !== '1') return 'light'
  const stored = localStorage.getItem('pivot:theme')
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'light'
}

function initialPreviewUrl(): string {
  if (typeof localStorage === 'undefined') return DEFAULT_PREVIEW_URL
  return normalizePreviewUrl(localStorage.getItem('pivot:preview-url') ?? '') ?? DEFAULT_PREVIEW_URL
}

function initialPreviewDevice(): PreviewDevice {
  if (typeof localStorage === 'undefined') return 'desktop'
  const stored = localStorage.getItem('pivot:preview-device')
  return stored === 'tablet' || stored === 'mobile' ? stored : 'desktop'
}

export interface UIStore {
  sidebarWidth: number
  rightPanelWidth: number
  theme: ThemeMode
  workspaceActivity: WorkspaceActivity
  sessionView: SessionView
  chatSubmode: ChatSubmode
  reasoningEffort: ReasoningEffort
  previewUrl: string
  previewDevice: PreviewDevice
  isConversationSidebarCollapsed: boolean
  isAgentPanelCollapsed: boolean

  setSidebarWidth: (w: number) => void
  setRightPanelWidth: (w: number) => void
  setTheme: (t: ThemeMode) => void
  setWorkspaceActivity: (activity: WorkspaceActivity) => void
  setSessionView: (view: SessionView) => void
  setChatSubmode: (submode: ChatSubmode) => void
  setReasoningEffort: (effort: ReasoningEffort) => void
  setPreviewUrl: (url: string) => void
  setPreviewDevice: (device: PreviewDevice) => void
  setConversationSidebarCollapsed: (collapsed: boolean) => void
  setAgentPanelCollapsed: (collapsed: boolean) => void
  toggleConversationSidebar: () => void
  toggleAgentPanel: () => void
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarWidth: 280,
  rightPanelWidth: 360,
  theme: initialTheme(),
  workspaceActivity: 'files',
  sessionView: 'editor',
  chatSubmode: 'agent',
  reasoningEffort: 3,
  previewUrl: initialPreviewUrl(),
  previewDevice: initialPreviewDevice(),
  isConversationSidebarCollapsed: false,
  isAgentPanelCollapsed: false,

  setSidebarWidth: (sidebarWidth) => {
    set({ sidebarWidth })
  },

  setRightPanelWidth: (rightPanelWidth) => {
    set({ rightPanelWidth })
  },

  setTheme: (theme) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pivot:theme-explicit', '1')
      localStorage.setItem('pivot:theme', theme)
    }
    set({ theme })
  },

  setWorkspaceActivity: (workspaceActivity) => {
    set({ workspaceActivity })
  },

  setSessionView: (sessionView) => {
    set({ sessionView })
  },

  setChatSubmode: (chatSubmode) => {
    set({ chatSubmode })
  },

  setReasoningEffort: (reasoningEffort) => {
    set({ reasoningEffort })
  },

  setPreviewUrl: (previewUrl) => {
    localStorage.setItem('pivot:preview-url', previewUrl)
    set({ previewUrl })
  },

  setPreviewDevice: (previewDevice) => {
    localStorage.setItem('pivot:preview-device', previewDevice)
    set({ previewDevice })
  },

  setConversationSidebarCollapsed: (isConversationSidebarCollapsed) => {
    set({ isConversationSidebarCollapsed })
  },

  setAgentPanelCollapsed: (isAgentPanelCollapsed) => {
    set({ isAgentPanelCollapsed })
  },

  toggleConversationSidebar: () => {
    set((state) => ({
      isConversationSidebarCollapsed: !state.isConversationSidebarCollapsed,
    }))
  },

  toggleAgentPanel: () => {
    set((state) => ({ isAgentPanelCollapsed: !state.isAgentPanelCollapsed }))
  },
}))
