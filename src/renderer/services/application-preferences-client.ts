import {
  ApplicationPreferencesSchema,
  ApplicationPreferencesUpdateRequestSchema,
  type ApplicationPreferences,
  type ApplicationPreferencesUpdateRequest,
} from '../../shared/application-preferences'

type ApplicationPreferencesChannel =
  | 'settings:application-preferences'
  | 'settings:update-application-preferences'

export type ApplicationPreferencesInvoke = (
  channel: ApplicationPreferencesChannel,
  request: ApplicationPreferencesUpdateRequest | undefined,
) => Promise<unknown>

export interface ApplicationPreferencesClientPort {
  get(): Promise<ApplicationPreferences>
  update(request: ApplicationPreferencesUpdateRequest): Promise<ApplicationPreferences>
}

export function createApplicationPreferencesClient(
  invoke: ApplicationPreferencesInvoke = (channel, request) => window.pivot.invoke(channel, request as never),
): ApplicationPreferencesClientPort {
  return Object.freeze({
    async get() {
      return ApplicationPreferencesSchema.parse(
        await invoke('settings:application-preferences', undefined),
      )
    },
    async update(input: ApplicationPreferencesUpdateRequest) {
      const request = ApplicationPreferencesUpdateRequestSchema.parse(input)
      return ApplicationPreferencesSchema.parse(
        await invoke('settings:update-application-preferences', request),
      )
    },
  })
}
