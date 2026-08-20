import type { PermissionRequest } from './types/domain'
import type { PlanDocument } from './types/domain'
import type { ApplicationUpdateState } from './application-update'

/**
 * 信号通道 — 主进程事件入 React 世界的唯一入口
 *
 * 三层通信模型中的 Layer 2：
 * - Layer 1: Custom Hook（用户操作协调多 Store）
 * - Layer 2: 信号通道（IPC 事件 → Renderer）
 * - Layer 3: getState() 只读读
 *
 * 设计原则：
 * - 事件只传最小标识符（路径/状态名），不传数据
 * - 订阅方通过 `useEffect return cleanup` 绑定生命周期
 * - 禁止在 Store 内部交叉写另一个 Store
 */

export type SignalMap = {
  'app:quick-capture': { source: 'shortcut' | 'tray' }
  'update:state': ApplicationUpdateState
  'file:changed': { path: string; action: 'add' | 'modify' | 'delete'; runId: string; sessionId: string }
  'file:system-changed': { path: string; action: 'add' | 'modify' | 'delete'; sessionId: string }
  'plan:updated': PlanDocument
  'agent:state': { runId: string; sessionId: string; state: 'idle' | 'thinking' | 'writing' | 'executing' | 'waiting_permission' | 'error' }
  'agent:operation': { id: string; status: 'pending' | 'running' | 'done' | 'error'; description: string; runId: string; sessionId: string }
  'stream:delta': { runId: string; sessionId: string; text: string }
  'stream:phase': { phase: 'thinking' | 'writing' | 'tool_use' | null; runId: string; sessionId: string }
  'permission:request': PermissionRequest
  'permission:resolved': { behavior: 'allow' | 'deny'; reason: 'response' | 'timeout' | 'abort' | 'error'; requestId: string }
  'term:data': { id: string; data: string }
  'term:exit': { id: string; exitCode: number; signal?: number }
}

type Handler<K extends keyof SignalMap> = (payload: SignalMap[K]) => void

export class SignalChannel {
  private handlers = new Map<string, Set<Function>>()

  /**
   * 订阅信号。返回 cleanup 函数，供 useEffect 调用。
   *
   * ```ts
   * useEffect(() => {
   *   return signalChannel.on('file:changed', ({ path, action }) => {
   *     markChanged(path, action)
   *   })
   * }, [markChanged])
   * ```
   */
  on<K extends keyof SignalMap>(event: K, handler: Handler<K>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    this.handlers.get(event)!.add(handler as Function)

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      this.handlers.get(event)?.delete(handler as Function)
    }
  }

  /**
   * 发射信号。只传最小标识符，接收方通过 Store selector 拉取详细数据。
   */
  emit<K extends keyof SignalMap>(event: K, payload: SignalMap[K]): void {
    this.handlers.get(event)?.forEach(handler => handler(payload))
  }

  /**
   * 清理所有订阅（用于测试或进程销毁时）。
   */
  clear(): void {
    this.handlers.clear()
  }

  /**
   * 返回当前活跃的订阅数（用于测试验证没有泄漏）。
   */
  get handlerCount(): number {
    let count = 0
    for (const set of this.handlers.values()) {
      count += set.size
    }
    return count
  }
}

export const signalChannel = new SignalChannel()
