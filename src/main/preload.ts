import { contextBridge, ipcRenderer } from 'electron'
import type { SignalMap } from '../shared/signal-channel'
import type { IPCContract, PivotPreloadApi } from '../shared/types/ipc'

type Channel = keyof IPCContract
type Signal = keyof SignalMap

const api: PivotPreloadApi = {
  invoke<K extends Channel>(
    channel: K,
    request: IPCContract[K]['request'],
  ): Promise<IPCContract[K]['response']> {
    return ipcRenderer.invoke(channel, request) as Promise<IPCContract[K]['response']>
  },

  onSignal<K extends Signal>(
    signal: K,
    handler: (payload: SignalMap[K]) => void,
  ): () => void {
    const listener = (_event: Electron.IpcRendererEvent, payload: SignalMap[K]): void => {
      handler(payload)
    }

    ipcRenderer.on(signal, listener)
    return () => {
      ipcRenderer.removeListener(signal, listener)
    }
  },
}

contextBridge.exposeInMainWorld('pivot', api)
