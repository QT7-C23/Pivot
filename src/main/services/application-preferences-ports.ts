import type {
  ApplicationPreferences,
  ApplicationPreferencesUpdateRequest,
} from '../../shared/application-preferences'

export interface ApplicationPreferencesReaderPort {
  get(): ApplicationPreferences
}

export interface ApplicationPreferencesWriterPort {
  update(request: ApplicationPreferencesUpdateRequest): ApplicationPreferences
}
