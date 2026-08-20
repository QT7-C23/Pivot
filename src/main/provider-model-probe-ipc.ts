import { handle } from './ipc-registration'
import { ProviderModelProbeAdapter } from './services/provider-model-probe-adapter'
import { ProviderModelProbeService, type ProviderModelProbeConfigurationPort } from './services/provider-model-probe-service'
import type { ProviderModelProbePort } from './services/provider-model-probe-port'

export function registerProviderModelProbeIpc(
  configuration: ProviderModelProbeConfigurationPort,
  probe: ProviderModelProbePort = new ProviderModelProbeAdapter().openPort(),
): void {
  const service = new ProviderModelProbeService({
    configuration,
    probe,
  })
  handle('provider:probe-models', async (request) => service.query(request))
}
