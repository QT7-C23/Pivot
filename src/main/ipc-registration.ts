import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import type { IPCContract } from '../shared/types/ipc'
import { validateIpcRequest } from '../shared/ipc-validation'
import { isTrustedRendererUrl, rendererEntryUrl } from './services/renderer-origin'

type Channel = keyof IPCContract
type Handler<K extends Channel> = (
  request: IPCContract[K]['request'],
  event: IpcMainInvokeEvent,
) => IPCContract[K]['response'] | Promise<IPCContract[K]['response']>

let trustedRendererUrl = rendererEntryUrl(process.env['ELECTRON_RENDERER_URL'], __dirname)

export function configureTrustedRendererUrl(value?: string): void {
  trustedRendererUrl = value ?? trustedRendererUrl
}

export function handle<K extends Channel>(channel: K, handler: Handler<K>): void {
  ipcMain.handle(channel, (event, request: unknown) => {
    assertTrustedSender(event)
    return handler(validateIpcRequest(channel, request), event)
  })
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const senderFrame = event.senderFrame
  if (!senderFrame || senderFrame !== event.sender.mainFrame || !isTrustedRendererUrl(senderFrame.url, trustedRendererUrl)) {
    throw new Error('Rejected IPC request from an untrusted renderer frame')
  }
}
