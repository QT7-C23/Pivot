import { create } from 'zustand'
import type { ApplicationUpdateState } from '../../shared/application-update'

interface UpdateStore {
  state: ApplicationUpdateState | null
  load(): Promise<void>
  check(): Promise<void>
  download(): Promise<void>
  install(): Promise<void>
  receive(state: ApplicationUpdateState): void
}

export const useUpdateStore = create<UpdateStore>((set) => ({
  state: null,
  async load() { set({ state: await window.pivot.invoke('update:state', undefined) }) },
  async check() { set({ state: await window.pivot.invoke('update:check', {}) }) },
  async download() { set({ state: await window.pivot.invoke('update:download', {}) }) },
  async install() { set({ state: await window.pivot.invoke('update:install', {}) }) },
  receive(state) { set({ state }) },
}))
