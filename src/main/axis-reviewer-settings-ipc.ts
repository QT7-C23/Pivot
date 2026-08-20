import { handle } from './ipc-registration'
import type { AxisReviewerQualificationService } from './services/axis-reviewer-qualification-service'
import type { AxisReviewerRoutingStore } from './services/axis-reviewer-routing-store'

export function registerAxisReviewerSettingsIpc(options: { qualification: Pick<AxisReviewerQualificationService, 'qualify'>; routing: Pick<AxisReviewerRoutingStore, 'read' | 'update'> }): void {
  handle('axis:qualify-reviewer', async (request) => options.qualification.qualify(request))
  handle('axis:get-reviewer-routing', async () => options.routing.read())
  handle('axis:update-reviewer-routing', async (request) => options.routing.update(request))
}
