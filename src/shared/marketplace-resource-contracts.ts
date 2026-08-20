import { z } from 'zod'
import { MarketplacePackageArtifactIdentitySchema } from './marketplace-contracts'

const StableIdSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
const TextSchema = z.string().trim().min(1).max(64 * 1024)
const ColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Theme colors must be six-digit hex values')

export const MarketplacePromptResourceSchema = z.object({
  content: TextSchema,
  id: StableIdSchema,
  kind: z.literal('prompt'),
  schemaVersion: z.literal(1),
  title: z.string().trim().min(1).max(160),
}).strict().readonly()

export const MarketplaceSkillResourceSchema = z.object({
  id: StableIdSchema,
  instructions: TextSchema,
  kind: z.literal('skill'),
  name: z.string().trim().min(1).max(160),
  schemaVersion: z.literal(1),
  triggers: z.array(z.string().trim().min(1).max(80)).max(32).default([]).readonly(),
}).strict().superRefine((resource, context) => {
  if (new Set(resource.triggers.map((value) => value.toLocaleLowerCase('en-US'))).size !== resource.triggers.length) {
    context.addIssue({ code: 'custom', message: 'Skill triggers must be unique' })
  }
}).readonly()

export const MarketplaceThemeTokensSchema = z.object({
  accentDefault: ColorSchema.optional(),
  accentEmphasis: ColorSchema.optional(),
  accentMuted: ColorSchema.optional(),
  backgroundCanvas: ColorSchema.optional(),
  backgroundElevated: ColorSchema.optional(),
  backgroundSurface: ColorSchema.optional(),
  borderDefault: ColorSchema.optional(),
  textPrimary: ColorSchema.optional(),
  textSecondary: ColorSchema.optional(),
}).strict().refine((tokens) => Object.keys(tokens).length > 0, 'Theme must declare at least one semantic token').readonly()

export const MarketplaceThemeResourceSchema = z.object({
  id: StableIdSchema,
  kind: z.literal('theme'),
  name: z.string().trim().min(1).max(160),
  schemaVersion: z.literal(1),
  tokens: MarketplaceThemeTokensSchema,
}).strict().readonly()

export const MarketplaceDataResourceSchema = z.discriminatedUnion('kind', [
  MarketplacePromptResourceSchema,
  MarketplaceSkillResourceSchema,
  MarketplaceThemeResourceSchema,
])

export const MarketplaceActiveResourceSummarySchema = z.object({
  displayName: z.string().trim().min(1).max(160),
  identity: MarketplacePackageArtifactIdentitySchema,
  installationRevision: z.number().int().nonnegative(),
  registrationId: StableIdSchema,
  themeTokens: MarketplaceThemeTokensSchema.nullable(),
}).strict().readonly()

export const MarketplaceActiveResourceCollectionSchema = z.object({
  items: z.array(MarketplaceActiveResourceSummarySchema).max(1_024).readonly(),
  schemaVersion: z.literal(1),
}).strict().readonly()

export const MarketplacePluginInvocationRequestSchema = z.object({
  registrationId: StableIdSchema,
}).strict().readonly()

export const MarketplacePluginInvocationResultSchema = z.object({
  emittedCodes: z.array(z.number().int().min(-2_147_483_648).max(2_147_483_647)).max(256).readonly(),
  resultCode: z.number().int().min(-2_147_483_648).max(2_147_483_647),
  schemaVersion: z.literal(1),
}).strict().readonly()

export type MarketplaceDataResource = z.infer<typeof MarketplaceDataResourceSchema>
export type MarketplaceThemeTokens = z.infer<typeof MarketplaceThemeTokensSchema>
export type MarketplaceActiveResourceCollection = z.infer<typeof MarketplaceActiveResourceCollectionSchema>
export type MarketplacePluginInvocationRequest = z.infer<typeof MarketplacePluginInvocationRequestSchema>
export type MarketplacePluginInvocationResult = z.infer<typeof MarketplacePluginInvocationResultSchema>
