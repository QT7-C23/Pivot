# Pivot UI V2 screen manifest

This is the implementation contract for the user-supplied Figma file `vsi6Wm7yOPOSBGytQxHOqv`.

Rules:

1. `1026:8514` is the normal post-onboarding entry. The former Now summary is not the default.
2. `1285:8199`, `1291:8035`, and `1291:8129` are first-launch-only onboarding screens.
3. The logical application canvas is fixed at 1440×900. Smaller windows scroll the root viewport; they do not squeeze or collapse the canvas.
4. Figma examples define layout and component state, never production records. Runtime counts, profile values, marketplace items, automation logs, provider usage, and storage totals must come from an owned contract or render an honest empty/unavailable state.
5. Shared colors, spacing, typography, radii, and elevation use `pivot-design-system.css` variables; repeated structures use shared React components.

| Figma node | Product surface/state | Production owner |
| --- | --- | --- |
| `1026:8514` | Dashboard / default entry | `DashboardWorkspace` |
| `1332:9449` | Dashboard Settings dropdown | `DashboardSettings` |
| `818:9607` | Profile / Home | `ProfileWorkspace` |
| `818:9019` | Profile / Achievements | `ProfileWorkspace` |
| `818:8988` | Edit Profile modal | `ProfileEditModal` |
| `818:12754` | Project / Chat / Context | `ProjectStudioChrome`, `AgentStatusPanel` |
| `818:14447` | Project / Chat / History | `AgentStatusPanel` |
| `818:14878` | Project / Chat / Agent | `AgentStatusPanel` |
| `818:15791` | Project / Tasks / plan | `ProjectStudioChrome`, `PlanWorkspace` |
| `818:13243` | Project / Tasks / execution | `ProjectStudioChrome`, `WorkPlanContextSidebar` |
| `818:16236` | Project / Diff | `ProjectStudioChrome`, `FileReviewWorkspace` |
| `818:13638` | Project / Runs | `ProjectStudioChrome`, `ContextTimelineWorkspace` |
| `818:14000` | Project / Preview and dropdown | `ProjectStudioChrome`, `PreviewWorkspace` |
| `818:14210` | Project / Terminal and dropdown | `ProjectStudioChrome`, `TerminalWorkspace` |
| `1499:11725` | Automations / Home | `AutomationWorkspace` |
| `1499:12679` | Automations / Create Pipeline | `AutomationCreate` |
| `1499:12887` | Automations / Run details | `AutomationRun` |
| `1506:9442` | Database / unavailable construction state | `DatabaseWorkspace` |
| `1476:8909` | Toolkit / installed resources | `InstalledProviderInventory` backed by Marketplace contracts |
| `818:9249` | Marketplace / Browse | `MarketplaceCatalogWorkspace` |
| `818:22103` | Marketplace / Plugins | `MarketplaceCatalogWorkspace` |
| `818:10388` | Marketplace / Model Hub | `MarketplaceCatalogWorkspace` honest unavailable state |
| `818:20102` | Marketplace / Skills | `MarketplaceCatalogWorkspace` |
| `818:20379` | Marketplace / Prompts | `MarketplaceCatalogWorkspace` |
| `818:20645` | Marketplace / Themes | `MarketplaceCatalogWorkspace` |
| `818:21049` | Marketplace detail / Overview | `MarketplaceDetail` |
| `818:22354` | Marketplace detail / Changelog | `MarketplaceDetail` verified-metadata state |
| `818:22642` | Marketplace detail / Reviews | `MarketplaceDetail` verified-metadata state |
| `818:23054` | Marketplace detail / Support | `MarketplaceDetail` |
| `818:4102` | Settings / General | `SettingsWorkspace` |
| `818:4269` | Settings / Appearance | `SettingsWorkspace` |
| `818:4457` | Settings / Privacy & Security | `SettingsWorkspace` honest unavailable state |
| `818:12358` | Settings / Slash Commands | `SettingsWorkspace` honest unavailable state |
| `818:5762` | Settings / Automations | `SettingsWorkspace` honest unavailable state |
| `818:11070` | Settings / Downloads | `SettingsWorkspace` honest unavailable state |
| `818:5444` | Settings / Plugins | `SettingsWorkspace` honest unavailable state |
| `1171:9637` | Settings / Models & Providers / Connections | `ModelsProvidersSettings` |
| `1171:11360` | Settings / Models & Providers / Routing | `ModelsProvidersSettings` |
| `818:11341` | Settings / Runtimes & CLI | `SettingsWorkspace` honest unavailable state |
| `818:4642` | Settings / Agents | `SettingsWorkspace` honest unavailable state |
| `818:5141` | Settings / MCP & Connectors | `SettingsWorkspace` honest unavailable state |
| `1405:10653` | Anthropic / connected | `ProviderDetail` |
| `1405:11063` | OpenAI / active | `ProviderDetail` |
| `1405:11501` | Gemini / active | `ProviderDetail` |
| `1405:11877` | Mistral / setup | `ProviderDetail` |
| `1406:11244` | Bedrock / connected | `ProviderDetail` |
| `1406:11690` | Ollama / running | `ProviderDetail` |
| `1406:12069` | Anthropic / rate limited | `ProviderDetail` |
| `1406:12440` | OpenAI / authentication failed | `ProviderDetail` |
| `818:5929` | Settings / Data & Storage | `SettingsWorkspace` honest unavailable state |
| `818:6184` | Settings / Updates | `UpdatesSettingsPage` |
| `818:6343` | Settings / Shortcuts | `ShortcutsSettingsPage` |
| `818:6499` | Settings / Advanced | `SettingsWorkspace` honest unavailable state |
| `818:18002` | Settings / Feedback | `FeedbackSettingsPage` |
| `818:6686` | Settings / About | `AboutSettingsPage` |
| `818:12562` | Help & Docs | `HelpWorkspace` |
| `818:21302` | Command Palette overlay | `CommandPalette` |
| `818:21434` | New Project modal | `NewProjectDialog` |

Source frames `2:8` and component library `2:5` are references for hierarchy and reusable components; they are not runtime screens.
