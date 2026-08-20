import { z } from 'zod'

export const ApplicationLocaleSchema = z.enum([
  'zh-CN',
  'en',
  'ja',
  'ko',
  'de',
  'fr',
  'es',
  'pt',
  'ru',
])

export const ApplicationThemeSchema = z.enum(['light', 'dark', 'system'])

export const ApplicationPreferenceValuesSchema = z.object({
  dateFormat: z.enum(['yyyy-mm-dd', 'dd-mm-yyyy', 'mm-dd-yyyy']),
  locale: ApplicationLocaleSchema,
  notificationLevel: z.enum(['all', 'failures', 'none']),
  openOnLaunch: z.enum(['last', 'home', 'new']),
  restoreSessions: z.boolean(),
  sessionTimeout: z.enum(['15', '30', '60', 'never']),
  startMinimized: z.boolean(),
  theme: ApplicationThemeSchema,
  timeFormat: z.enum(['12', '24']),
}).strict()

export const ApplicationPreferencesSchema = z.object({
  revision: z.number().int().nonnegative(),
  schemaVersion: z.literal(2),
  updatedAt: z.string().datetime(),
  values: ApplicationPreferenceValuesSchema,
}).strict()

export const ApplicationPreferencesUpdateRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  patch: ApplicationPreferenceValuesSchema.partial().strict().refine(
    (value) => Object.keys(value).length > 0,
    'expected at least one application preference',
  ),
}).strict()

export type ApplicationLocale = z.infer<typeof ApplicationLocaleSchema>
export type ApplicationTheme = z.infer<typeof ApplicationThemeSchema>
export type ApplicationPreferenceValues = z.infer<typeof ApplicationPreferenceValuesSchema>
export type ApplicationPreferences = z.infer<typeof ApplicationPreferencesSchema>
export type ApplicationPreferencesUpdateRequest = z.infer<typeof ApplicationPreferencesUpdateRequestSchema>

export const DEFAULT_APPLICATION_PREFERENCE_VALUES: Readonly<ApplicationPreferenceValues> = Object.freeze({
  dateFormat: 'yyyy-mm-dd',
  locale: 'en',
  notificationLevel: 'failures',
  openOnLaunch: 'last',
  restoreSessions: true,
  sessionTimeout: '30',
  startMinimized: false,
  theme: 'light',
  timeFormat: '24',
})
