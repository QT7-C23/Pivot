/**
 * 信号通道 hook — 在 React 组件中绑定信号生命周期
 *
 * ```ts
 * function useFileChangeSignal() {
 *   const markChanged = useFileStore(s => s.markChanged)
 *   useEffect(() => {
 *     return signalChannel.on('file:changed', ({ path, action }) => {
 *       markChanged(path, action)
 *     })
 *   }, [markChanged])
 * }
 * ```
 */

export { signalChannel } from '../../shared/signal-channel'
export type { SignalMap } from '../../shared/signal-channel'
