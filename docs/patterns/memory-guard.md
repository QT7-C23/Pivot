/**
 * 内防线参考 — 组件开发时遵循的模式
 *
 * 防线 1 — 面板组件级懒加载
 * ```tsx
 * // 非活跃面板不 mount DOM（不只是 CSS 隐藏）
 * {activeTab === 'diff' && <DiffPanel filePath={filePath} />}
 * {activeTab === 'terminal' && <TerminalPanel />}
 *
 * // Agent 状态面板按子区域独立懒加载
 * <AgentStatusPanel>
 *   <StatusIndicator />                    // 始终可见
 *   {state !== 'idle' && <OperationList />}  // 非空闲才 mount
 *   {state !== 'idle' && <TokenUsage />}     // 非空闲才 mount
 * </AgentStatusPanel>
 * ```
 *
 * 防线 4 — useEffect cleanup 纪律
 * ```tsx
 * // 每个 subscribe 必须 return unsubscribe
 * useEffect(() => {
 *   return signalChannel.on('file:changed', handler)
 * }, [])
 *
 * useEffect(() => {
 *   window.addEventListener('resize', onResize)
 *   return () => window.removeEventListener('resize', onResize)
 * }, [])
 *
 * // Monaco dispose
 * useEffect(() => {
 *   const editor = monaco.editor.create(container, options)
 *   return () => { editor.dispose() }
 * }, [])
 * ```
 */
export {}
