import type { PlanDocument, PlanDraftInput, PlanExecutionMode } from '../../shared/types/domain'

export const planService = {
  listAll(): Promise<PlanDocument[]> {
    return window.pivot.invoke('plan:list-all', {})
  },
  list(sessionId: string): Promise<PlanDocument[]> {
    return window.pivot.invoke('plan:list', { sessionId })
  },
  generate(sessionId: string, source: string): Promise<PlanDocument> {
    return window.pivot.invoke('plan:generate', { sessionId, source })
  },
  update(id: string, draft: PlanDraftInput): Promise<PlanDocument> {
    return window.pivot.invoke('plan:update', { draft, id })
  },
  approve(id: string, executionMode: PlanExecutionMode, selectedStepIds?: string[]): Promise<PlanDocument> {
    return window.pivot.invoke('plan:approve', { executionMode, id, selectedStepIds })
  },
  execute(id: string): Promise<PlanDocument> {
    return window.pivot.invoke('plan:execute', { id })
  },
  executeNext(id: string): Promise<PlanDocument> {
    return window.pivot.invoke('plan:execute-next', { id })
  },
  cancel(id: string): Promise<PlanDocument> {
    return window.pivot.invoke('plan:cancel', { id })
  },
}
