import { app, BrowserWindow, globalShortcut, Menu, nativeImage, session, Tray } from 'electron'
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { APP_RELEASE_VERSION, APP_VERSION } from '../shared/app-version'
import type { SignalMap } from '../shared/signal-channel'
import { registerIpcHandlers, type IpcRuntimeResources } from './ipc-handlers'
import { DesktopPresenceController, shouldHideWindowOnClose, type QuickCaptureSource } from './services/desktop-presence'
import { ApplicationUpdateService } from './services/application-updater'
import { resolveHardwareAccelerationPolicy } from './services/hardware-acceleration'
import { createMainWindowOptions } from './services/main-window-options'
import { configurePreviewHost, configurePreviewSession, PREVIEW_PARTITION } from './services/preview-security'
import { isTrustedRendererUrl, rendererEntryUrl } from './services/renderer-origin'
import { initializeStartupRuntime } from './services/startup-runtime'
import { createPivotTrayIconDataUrl } from './services/tray-icon'
import { resolveUserDataPath } from './services/user-data-path'
import { revealWindow } from './services/window-visibility'

const hardwareAccelerationPolicy = resolveHardwareAccelerationPolicy(process.env)
if (hardwareAccelerationPolicy.disableHardwareAcceleration) {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu')
}
if (hardwareAccelerationPolicy.disableGpuSandbox) {
  app.commandLine.appendSwitch('disable-gpu-sandbox')
}

const defaultUserDataPath = app.getPath('userData')
const userDataPath = resolveUserDataPath(process.env, process.platform, defaultUserDataPath)
if (userDataPath !== defaultUserDataPath) app.setPath('userData', userDataPath)

app.commandLine.appendSwitch(
  'js-flags',
  '--max-old-space-size=1536 --max-semi-space-size=64',
)

let mainWindow: BrowserWindow | null = null
let ipcRuntime: IpcRuntimeResources | null = null
let runtimeClosedForQuit = false
let desktopPresence: DesktopPresenceController | null = null
let applicationUpdates: ApplicationUpdateService | null = null
let tray: Tray | null = null
let registeredQuickCaptureAccelerator: string | null = null
let isQuitting = false
const processStartedAt = Date.now()

function traceStartup(stage: string, detail?: unknown): void {
  const tracePath = process.env['PIVOT_STARTUP_TRACE']
  if (!tracePath) return
  try {
    const suffix = detail === undefined ? '' : ` ${detail instanceof Error ? detail.stack ?? detail.message : String(detail)}`
    appendFileSync(tracePath, `${new Date().toISOString()} ${stage}${suffix}\n`, 'utf8')
  } catch {
    // Startup diagnostics must never become another startup failure.
  }
}

traceStartup('module-loaded')

function setupDesktopPresence(): void {
  desktopPresence = new DesktopPresenceController({
    getWindow: () => mainWindow,
    onQuickCapture: (_window, source: QuickCaptureSource) => {
      const payload: SignalMap['app:quick-capture'] = { source }
      mainWindow?.webContents.send('app:quick-capture', payload)
    },
    shortcuts: globalShortcut,
  })

  registeredQuickCaptureAccelerator = desktopPresence.start()
  if (!registeredQuickCaptureAccelerator) {
    console.warn('Pivot could not register the global quick-capture shortcut.')
  }

  try {
    const icon = nativeImage.createFromDataURL(createPivotTrayIconDataUrl())
    if (icon.isEmpty()) throw new Error('tray icon could not be decoded')
    tray = new Tray(icon.resize({ height: 16, quality: 'best', width: 16 }))
    const isChinese = app.getLocale().toLowerCase().startsWith('zh')
    const labels = isChinese
      ? { open: '打开 Pivot', quickCapture: '快速捕获', quit: '退出 Pivot' }
      : { open: 'Open Pivot', quickCapture: 'Quick Capture', quit: 'Quit Pivot' }

    tray.setToolTip(`Pivot ${APP_VERSION}`)
    tray.setContextMenu(Menu.buildFromTemplate([
      {
        click: () => desktopPresence?.showWindow(),
        label: labels.open,
      },
      {
        click: () => desktopPresence?.quickCapture('tray'),
        label: `${labels.quickCapture} (${registeredQuickCaptureAccelerator ?? 'Alt+Space'})`,
      },
      { type: 'separator' },
      {
        click: () => {
          isQuitting = true
          app.quit()
        },
        label: labels.quit,
      },
    ]))
    tray.on('click', () => desktopPresence?.showWindow())
    tray.on('double-click', () => desktopPresence?.quickCapture('tray'))
  } catch (error) {
    tray = null
    console.error('Pivot could not initialize its system tray:', error)
  }
}

function createWindow(): void {
  const trustedRendererUrl = rendererEntryUrl(process.env['ELECTRON_RENDERER_URL'], __dirname)
  mainWindow = new BrowserWindow(
    createMainWindowOptions(path.join(__dirname, '../preload/preload.cjs'), APP_VERSION),
  )
  const revealMainWindow = (): void => {
    if (mainWindow) revealWindow(mainWindow)
  }
  mainWindow.once('ready-to-show', revealMainWindow)
  mainWindow.webContents.once('did-finish-load', revealMainWindow)
  const revealTimer = setTimeout(revealMainWindow, 1_500)
  revealTimer.unref()
  const webContentsId = mainWindow.webContents.id
  mainWindow.webContents.once('destroyed', () => {
    void ipcRuntime?.disposeRenderer(webContentsId).catch((error) => {
      console.error('Pivot could not dispose renderer capabilities:', error)
    })
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`Renderer failed to load ${validatedURL}: ${errorCode} ${errorDescription}`)
  })

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      console.error(`Renderer console: ${message} (${sourceId}:${line})`)
    }
  })
  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault()
    mainWindow?.setTitle(`Pivot ${APP_VERSION}`)
  })
  mainWindow.on('close', (event) => {
    if (!shouldHideWindowOnClose({
      hasTray: Boolean(tray),
      isE2E: process.env['PIVOT_E2E_SMOKE'] === '1',
      isQuitting,
    })) return
    event.preventDefault()
    mainWindow?.hide()
  })
  if (process.env['PIVOT_E2E_SMOKE'] === '1') {
    mainWindow.webContents.once('did-finish-load', () => {
      void (async () => {
        const webContents = mainWindow?.webContents
        if (!webContents) throw new Error('Pivot window closed before the E2E check')
        if (process.env['PIVOT_E2E_SETTINGS'] === '1' || process.env['PIVOT_E2E_WORKBENCH'] === '1' || process.env['PIVOT_E2E_TIMELINE'] === '1' || process.env['PIVOT_E2E_PREVIEW'] === '1' || process.env['PIVOT_E2E_EDITOR_LAZY'] === '1' || process.env['PIVOT_E2E_RUNTIME'] === '1' || process.env['PIVOT_E2E_NOW'] === '1' || process.env['PIVOT_E2E_WORK'] === '1' || process.env['PIVOT_E2E_PROJECT'] === '1' || process.env['PIVOT_E2E_AUTOMATIONS'] === '1' || process.env['PIVOT_E2E_EXTENSIONS'] === '1' || process.env['PIVOT_E2E_COMMAND_PALETTE'] === '1' || process.env['PIVOT_E2E_NEW_PROJECT'] === '1') {
          await webContents.executeJavaScript(`
            localStorage.setItem('pivot:onboarding-complete', '1');
            ${process.env['PIVOT_E2E_LOCALE'] ? `localStorage.setItem('pivot:language', ${JSON.stringify(process.env['PIVOT_E2E_LOCALE'])});` : ''}
          `)
          await new Promise<void>((resolve) => {
            webContents.once('did-finish-load', () => resolve())
            webContents.reload()
          })
        }
        if (process.env['PIVOT_E2E_DESKTOP'] === '1') {
          await webContents.executeJavaScript(`(async () => {
            for (let attempt = 0; attempt < 120; attempt += 1) {
              if (document.querySelector('main.welcome-screen:not([aria-busy="true"]), main.pv-app-shell')) break;
              await new Promise((resolve) => requestAnimationFrame(() => resolve()));
            }
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          })()`)
          const payload: SignalMap['app:quick-capture'] = { source: 'shortcut' }
          webContents.send('app:quick-capture', payload)
        }
        return webContents.executeJavaScript(`(async () => {
          const waitFor = async (selector) => {
            for (let attempt = 0; attempt < 120; attempt += 1) {
              const node = document.querySelector(selector);
              if (node) return node;
              await new Promise((resolve) => requestAnimationFrame(() => resolve()));
            }
            return null;
          };
          await waitFor('main.welcome-screen:not([aria-busy="true"]), main.pv-app-shell');
          if (${JSON.stringify(process.env['PIVOT_E2E_WORKBENCH'] === '1')}) {
            document.querySelector('button[data-route="sessions"]')?.click();
            await waitFor('.route-sessions');
          }
          if (${JSON.stringify(process.env['PIVOT_E2E_RUNTIME'] === '1')}) {
            document.querySelector('button[data-route="runtimes"]')?.click();
            await waitFor('.pv-runtime-hub');
          }
          if (${JSON.stringify(process.env['PIVOT_E2E_WORK'] === '1')}) {
            document.querySelector('button[data-route="work"]')?.click();
            await waitFor('.plan-workspace');
          }
          if (${JSON.stringify(process.env['PIVOT_E2E_PROJECT'] === '1')}) {
            document.querySelector('button[data-route="projects"]')?.click();
            await waitFor('.pv-project-overview, .pv-project-empty-state');
          }
          let automationPresence = null;
          if (${JSON.stringify(process.env['PIVOT_E2E_AUTOMATIONS'] === '1')}) {
            document.querySelector('button[data-route="automations"]')?.click();
            const workspace = await waitFor('.pv-automation-home');
            const createButton = workspace?.querySelector('.pv-automation-zero button:first-child');
            const browseButton = workspace?.querySelector('.pv-automation-zero button:last-child');
            automationPresence = workspace ? {
              browseEnabled: Boolean(browseButton && !browseButton.disabled),
              createDisabled: Boolean(createButton?.disabled),
              examples: workspace.querySelectorAll('.pv-automation-list > button').length,
              figmaScreen: workspace.getAttribute('data-figma-screen'),
              navigatedToMarketplace: false,
              pipelines: workspace.querySelectorAll('.pv-automation-list').length,
              visible: workspace.getBoundingClientRect().width > 0
            } : null;
            browseButton?.click();
            if (automationPresence) automationPresence.navigatedToMarketplace = Boolean(await waitFor('.surface-marketplace'));
          }
          let extensionPresence = null;
          if (${JSON.stringify(process.env['PIVOT_E2E_EXTENSIONS'] === '1')}) {
            document.querySelector('button[data-route="extensions"]')?.click();
            const workspace = await waitFor('.pv-toolkit');
            const browseButton = workspace?.querySelector('.pv-extension-empty button');
            extensionPresence = workspace ? {
              browseEnabled: Boolean(browseButton && !browseButton.disabled),
              figmaScreen: workspace.getAttribute('data-figma-screen'),
              installedRows: workspace.querySelectorAll('.pv-toolkit-list > article').length,
              navigatedToMarketplace: false,
              searchInputs: workspace.querySelectorAll('input[type="search"]').length,
              visible: workspace.getBoundingClientRect().width > 0
            } : null;
            browseButton?.click();
            if (extensionPresence) extensionPresence.navigatedToMarketplace = Boolean(await waitFor('.surface-marketplace'));
          }
          let commandPalettePresence = null;
          if (${JSON.stringify(process.env['PIVOT_E2E_COMMAND_PALETTE'] === '1')}) {
            const trigger = await waitFor('.pv-command-palette-trigger');
            trigger?.click();
            const openedByButton = Boolean(await waitFor('.pv-command-palette'));
            const firstInput = document.querySelector('.pv-command-search input');
            firstInput?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const closedByEscape = !document.querySelector('.pv-command-palette');
            window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ctrlKey: true, key: 'k' }));
            const openedByShortcut = Boolean(await waitFor('.pv-command-palette'));
            const input = document.querySelector('.pv-command-search input');
            if (input) {
              const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
              valueSetter?.call(input, 'settings');
              input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const settingsCommand = document.querySelector('[data-command-id="command:settings"]');
            input?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
            const settingsNavigation = await waitFor('.pv-settings-navigation');
            commandPalettePresence = {
              closedAfterExecute: !document.querySelector('.pv-command-palette'),
              closedByEscape,
              navigatedToSettings: Boolean(settingsNavigation),
              openedByButton,
              openedByShortcut,
              settingsCommand: Boolean(settingsCommand)
            };
          }
          let newProjectPresence = null;
          if (${JSON.stringify(process.env['PIVOT_E2E_NEW_PROJECT'] === '1')}) {
            const newProjectButton = await waitFor('.pv-dashboard-greeting button.primary');
            newProjectButton?.click();
            const dialog = await waitFor('.pv-new-project-dialog');
            const nameInput = document.querySelector('[data-new-project-field="name"]');
            const parentInput = document.querySelector('[data-new-project-field="parent"]');
            const gitInput = document.querySelector('.pv-new-project-git input[type="checkbox"]');
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            if (nameInput) {
              valueSetter?.call(nameInput, 'smoke-project');
              nameInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (parentInput) {
              valueSetter?.call(parentInput, ${JSON.stringify(process.env['PIVOT_E2E_NEW_PROJECT_PARENT'] ?? '')});
              parentInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (gitInput?.checked) gitInput.click();
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            document.querySelector('.pv-new-project-dialog button.primary')?.click();
            const sessionRoute = await waitFor('.route-sessions');
            newProjectPresence = {
              closedAfterCreate: !document.querySelector('.pv-new-project-dialog'),
              enteredSession: Boolean(sessionRoute),
              figmaScreen: dialog?.parentElement?.getAttribute('data-figma-screen') ?? null,
              opened: Boolean(dialog)
            };
          }
          if (${JSON.stringify(process.env['PIVOT_E2E_DESKTOP'] === '1')}) await waitFor('.route-sessions');
          if (${JSON.stringify(process.env['PIVOT_E2E_TIMELINE'] === '1')}) {
            document.querySelector('button[data-route="work"]')?.click();
            await waitFor('.pv-work-stage');
            const timelineButton = document.querySelector('button[aria-label="上下文时间线"], button[aria-label="Context timeline"]');
            timelineButton?.click();
            await waitFor('.timeline-workspace');
          }
          if (${JSON.stringify(process.env['PIVOT_E2E_PREVIEW'] === '1')}) {
            document.querySelector('button[data-route="sessions"]')?.click();
            await waitFor('.pv-session-stage');
            const previewButton = document.querySelector('.pv-stage-tabs .work-tab:nth-child(3)');
            previewButton?.click();
            await waitFor('.preview-workspace');
          }
          let editorLazyPresence = null;
          if (${JSON.stringify(process.env['PIVOT_E2E_EDITOR_LAZY'] === '1')}) {
            const initialHasEditorRuntime = Boolean(document.querySelector('.monaco-editor'));
            document.querySelector('button[data-route="projects"]')?.click();
            await waitFor('.route-projects');
            const editorButton = await waitFor('.pv-stage-tabs .work-tab:nth-child(2)');
            editorButton?.click();
            await waitFor('.editor-workspace:not(.editor-loading-state)');
            const mountedAfterOpen = Boolean(await waitFor('.monaco-editor'));
            editorLazyPresence = { initialHasEditorRuntime, mountedAfterOpen };
          }
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const base = {
            hasRoot: Boolean(document.querySelector('main.welcome-screen, main.pv-app-shell')),
            hasPreload: typeof window.pivot?.invoke === 'function',
            locale: document.documentElement.lang,
            title: document.title,
            desktopPresence: {
              hasTray: ${JSON.stringify(Boolean(tray))},
              quickCaptureOpened: Boolean(document.querySelector('.route-sessions')) && localStorage.getItem('pivot:onboarding-complete') === '1',
              shortcut: ${JSON.stringify(registeredQuickCaptureAccelerator)}
            },
            visualLayout: (() => {
              const shell = document.querySelector('main.pv-app-shell');
              const workbench = document.querySelector('.pv-shell-content');
              const agentPanel = document.querySelector('.agent-panel');
              return shell && workbench && agentPanel ? {
                agentClass: agentPanel.className,
                agentAlign: getComputedStyle(agentPanel).alignItems,
                agentText: agentPanel.textContent?.replace(/\s+/g, ' ').trim(),
                agentWidth: Math.round(agentPanel.getBoundingClientRect().width),
                firstChildWidth: Math.round((agentPanel.firstElementChild?.getBoundingClientRect().width ?? 0)),
                columns: getComputedStyle(workbench).gridTemplateColumns,
                shellClass: shell.className
              } : null;
            })(),
            timelinePresence: (() => {
              const workspace = document.querySelector('.timeline-workspace');
              const filters = document.querySelectorAll('.timeline-filter button');
              return workspace ? { filters: filters.length, height: Math.round(workspace.getBoundingClientRect().height), visible: workspace.getBoundingClientRect().width > 0 } : null;
            })(),
            previewPresence: (() => {
              const workspace = document.querySelector('.preview-workspace');
              return workspace ? {
                devices: document.querySelectorAll('.preview-device-switcher button').length,
                hasAddress: Boolean(document.querySelector('.preview-address input')),
                hasGuest: Boolean(document.querySelector('.preview-webview-host webview')),
                height: Math.round(workspace.getBoundingClientRect().height),
                visible: workspace.getBoundingClientRect().width > 0
              } : null;
            })(),
            editorLazyPresence,
            runtimePresence: (() => {
              const hub = document.querySelector('.pv-runtime-hub');
              return hub ? {
                profiles: document.querySelectorAll('.pv-runtime-list button').length,
                hasRecoveryCopy: Boolean(hub.querySelector('[data-recovery-copy="true"]')),
                visible: hub.getBoundingClientRect().width > 0
              } : null;
            })(),
            nowPresence: (() => {
              const workspace = document.querySelector('.pv-now-workspace');
              const metric = workspace?.querySelector('.pv-dashboard-metric');
              const context = document.querySelector('.pv-workspace-context');
              const railItem = document.querySelector('.pv-rail-button');
              return workspace ? {
                cardBackground: metric ? getComputedStyle(metric).backgroundColor : '',
                canvasBackground: getComputedStyle(workspace).backgroundColor,
                contextVariant: context?.getAttribute('data-context-variant') ?? '',
                hasLegacyControls: Boolean(document.querySelector('.project-card, .sidebar-search, .session-group-create')),
                metrics: workspace.querySelectorAll('.pv-dashboard-metric').length,
                railItemHeight: railItem ? Math.round(railItem.getBoundingClientRect().height) : 0,
                sections: workspace.querySelectorAll('.pv-dashboard-panel').length,
                theme: document.documentElement.dataset.theme ?? '',
                visible: workspace.getBoundingClientRect().width > 0
              } : null;
            })(),
            workPresence: (() => {
              const workspace = document.querySelector('.plan-workspace');
              const shellContent = document.querySelector('.pv-shell-content');
              const contextHeader = document.querySelector('.pv-plan-context header');
              return workspace ? {
                columns: shellContent ? getComputedStyle(shellContent).gridTemplateColumns.split(' ').length : 0,
                contextHeaderHeight: contextHeader ? Math.round(contextHeader.getBoundingClientRect().height) : 0,
                contextSections: document.querySelectorAll('.pv-plan-context > section').length,
                hasInspector: Boolean(document.querySelector('.pv-plan-inspector')),
                view: 'plan',
                visible: workspace.getBoundingClientRect().width > 0
              } : null;
            })(),
            projectPresence: (() => {
              const workspace = document.querySelector('.pv-project-overview, .pv-project-empty-state');
              const shellContent = document.querySelector('.pv-shell-content');
              return workspace ? {
                cards: workspace.querySelectorAll('.pv-project-card, .pv-project-empty-guide').length,
                columns: shellContent ? getComputedStyle(shellContent).gridTemplateColumns.split(' ').length : 0,
                empty: workspace.classList.contains('pv-project-empty-state'),
                figmaScreen: workspace.getAttribute('data-figma-screen'),
                tabs: workspace.querySelectorAll('.pv-project-tabs button').length,
                visible: workspace.getBoundingClientRect().width > 0
              } : null;
            })(),
            automationPresence,
            extensionPresence,
            commandPalettePresence,
            newProjectPresence
          };
          if (${JSON.stringify(process.env['PIVOT_E2E_SETTINGS'] === '1')}) {
            const settingsButton = await waitFor('button[data-route="settings"]');
            settingsButton?.click();
            await waitFor('.pv-settings-navigation');
            const buttons = [...document.querySelectorAll('.pv-settings-navigation nav button')];
            const settingsLabels = buttons.map((button) => button.textContent?.trim());
            const sectionHeadings = [];
            for (const button of buttons) {
              button.click();
              await new Promise((resolve) => requestAnimationFrame(() => resolve()));
              sectionHeadings.push(document.querySelector('.pv-settings-page h1, .pv-provider-settings > header h1, .pv-about-hero h1, .pv-settings-empty > strong')?.textContent?.trim());
            }
            buttons[${process.env['PIVOT_E2E_PLUGINS'] === '1' ? 8 : process.env['PIVOT_E2E_PROVIDER'] === '1' ? 2 : 0}]?.click();
            await new Promise((resolve) => requestAnimationFrame(() => resolve()));
            const maintenanceResult = await window.pivot.invoke('agent:run-cli-maintenance', { action: 'version', profileId: 'claude' });
            const updateState = await window.pivot.invoke('update:state', undefined);
            return { ...base, maintenanceContract: typeof maintenanceResult.unavailable === 'boolean', updateContract: updateState.status === 'unavailable' || typeof updateState.currentVersion === 'string', sectionHeadings, settingsLabels };
          }
          return base;
        })()`)
      })().then(async (result: {
        hasPreload: boolean
        hasRoot: boolean
        desktopPresence?: { hasTray: boolean; quickCaptureOpened: boolean; shortcut: string | null }
        editorLazyPresence?: { initialHasEditorRuntime: boolean; mountedAfterOpen: boolean } | null
        locale: string
        maintenanceContract?: boolean
        updateContract?: boolean
        sectionHeadings?: string[]
        settingsLabels?: string[]
        title: string
        visualLayout?: { agentAlign: string; agentWidth: number; columns: string; firstChildWidth: number; shellClass: string } | null
        timelinePresence?: { filters: number; height: number; visible: boolean } | null
        previewPresence?: { devices: number; hasAddress: boolean; hasGuest: boolean; height: number; visible: boolean } | null
        runtimePresence?: { profiles: number; hasRecoveryCopy: boolean; visible: boolean } | null
        nowPresence?: { cardBackground: string; canvasBackground: string; contextVariant: string; hasLegacyControls: boolean; metrics: number; railItemHeight: number; sections: number; theme: string; visible: boolean } | null
        workPresence?: { columns: number; contextHeaderHeight: number; contextSections: number; hasInspector: boolean; view: string; visible: boolean } | null
        projectPresence?: { cards: number; columns: number; empty: boolean; figmaScreen: string | null; tabs: number; visible: boolean } | null
        automationPresence?: { browseEnabled: boolean; createDisabled: boolean; examples: number; figmaScreen: string | null; navigatedToMarketplace: boolean; pipelines: number; visible: boolean } | null
        extensionPresence?: { browseEnabled: boolean; figmaScreen: string | null; installedRows: number; navigatedToMarketplace: boolean; searchInputs: number; visible: boolean } | null
        commandPalettePresence?: { closedAfterExecute: boolean; closedByEscape: boolean; navigatedToSettings: boolean; openedByButton: boolean; openedByShortcut: boolean; settingsCommand: boolean } | null
        newProjectPresence?: { closedAfterCreate: boolean; enteredSession: boolean; figmaScreen: string | null; opened: boolean } | null
      }) => {
        const expectedSettingsLabels = ['General', 'Appearance', 'Models & Providers', 'Runtimes & CLI', 'Agents', 'Skills', 'Slash Commands', 'MCP & Connectors', 'Plugins', 'Downloads', 'Automations', 'Privacy & Security', 'Data & Storage', 'Updates', 'Shortcuts', 'Advanced', 'Feedback', 'About']
        const settingsPassed = process.env['PIVOT_E2E_SETTINGS'] !== '1' || Boolean(
          result.settingsLabels?.length === expectedSettingsLabels.length
          && result.settingsLabels.every((label, index) => label === expectedSettingsLabels[index])
          && result.sectionHeadings?.filter(Boolean).length === expectedSettingsLabels.length
          && result.sectionHeadings?.includes('Feedback')
          && result.maintenanceContract === true
          && result.updateContract === true,
        )
        const localePassed = !process.env['PIVOT_E2E_LOCALE'] || result.locale === process.env['PIVOT_E2E_LOCALE']
        const workbenchPassed = process.env['PIVOT_E2E_WORKBENCH'] !== '1' || Boolean(
          result.visualLayout
          && result.visualLayout.agentAlign === 'stretch'
          && result.visualLayout.agentWidth === 0
          && result.visualLayout.shellClass.includes('route-sessions')
          && result.visualLayout.columns.split(' ').length === 2,
        )
        const desktopPassed = process.env['PIVOT_E2E_DESKTOP'] !== '1' || Boolean(
          result.desktopPresence?.hasTray
          && result.desktopPresence.quickCaptureOpened
          && result.desktopPresence.shortcut,
        )
        const timelinePassed = process.env['PIVOT_E2E_TIMELINE'] !== '1' || Boolean(
          result.timelinePresence?.visible
          && result.timelinePresence.filters === 3
          && result.timelinePresence.height >= 300
        )
        const previewPassed = process.env['PIVOT_E2E_PREVIEW'] !== '1' || Boolean(
          result.previewPresence?.visible
          && result.previewPresence.hasAddress
          && result.previewPresence.hasGuest
          && result.previewPresence.devices === 3
          && result.previewPresence.height >= 300
        )
        const editorLazyPassed = process.env['PIVOT_E2E_EDITOR_LAZY'] !== '1' || Boolean(
          result.editorLazyPresence
          && !result.editorLazyPresence.initialHasEditorRuntime
          && result.editorLazyPresence.mountedAfterOpen
        )
        const runtimePassed = process.env['PIVOT_E2E_RUNTIME'] !== '1' || Boolean(
          result.runtimePresence?.visible
          && result.runtimePresence.hasRecoveryCopy
          && result.runtimePresence.profiles >= 4
        )
        const nowPassed = process.env['PIVOT_E2E_NOW'] !== '1' || Boolean(
          result.nowPresence?.visible
          && result.nowPresence.sections === 8
          && result.nowPresence.metrics === 4
          && result.nowPresence.theme === 'light'
          && result.nowPresence.cardBackground === 'rgb(255, 255, 255)'
          && result.nowPresence.contextVariant === ''
          && result.nowPresence.hasLegacyControls === false
          && result.nowPresence.railItemHeight === 48
        )
        const workPassed = process.env['PIVOT_E2E_WORK'] !== '1' || Boolean(
          result.workPresence?.visible
          && result.workPresence.view === 'plan'
          && result.workPresence.columns === 3
          && result.workPresence.contextHeaderHeight === 54
          && result.workPresence.contextSections === 3
          && result.workPresence.hasInspector
        )
        const projectPassed = process.env['PIVOT_E2E_PROJECT'] !== '1' || Boolean(
          result.projectPresence?.visible
          && (result.projectPresence.empty
            ? result.projectPresence.cards === 3 && result.projectPresence.columns === 1 && result.projectPresence.figmaScreen === '597:6165' && result.projectPresence.tabs === 0
            : result.projectPresence.cards === 4 && result.projectPresence.columns === 2 && result.projectPresence.figmaScreen === '63:394' && result.projectPresence.tabs === 5)
        )
        const automationPassed = process.env['PIVOT_E2E_AUTOMATIONS'] !== '1' || Boolean(
          result.automationPresence?.visible
          && result.automationPresence.browseEnabled
          && result.automationPresence.createDisabled
          && result.automationPresence.examples === 0
          && result.automationPresence.figmaScreen === '1499:11725'
          && result.automationPresence.navigatedToMarketplace
          && result.automationPresence.pipelines === 1
        )
        const extensionPassed = process.env['PIVOT_E2E_EXTENSIONS'] !== '1' || Boolean(
          result.extensionPresence?.visible
          && result.extensionPresence.figmaScreen === '1476:8909'
          && result.extensionPresence.installedRows === 0
          && result.extensionPresence.navigatedToMarketplace
          && result.extensionPresence.searchInputs === 1
        )
        const commandPalettePassed = process.env['PIVOT_E2E_COMMAND_PALETTE'] !== '1' || Boolean(
          result.commandPalettePresence?.openedByButton
          && result.commandPalettePresence.closedByEscape
          && result.commandPalettePresence.openedByShortcut
          && result.commandPalettePresence.settingsCommand
          && result.commandPalettePresence.closedAfterExecute
          && result.commandPalettePresence.navigatedToSettings
        )
        const expectedNewProjectPath = path.join(process.env['PIVOT_E2E_NEW_PROJECT_PARENT'] ?? '', 'smoke-project')
        const newProjectPassed = process.env['PIVOT_E2E_NEW_PROJECT'] !== '1' || Boolean(
          result.newProjectPresence?.opened
          && result.newProjectPresence.figmaScreen === '818:21434'
          && result.newProjectPresence.closedAfterCreate
          && result.newProjectPresence.enteredSession
          && existsSync(expectedNewProjectPath)
        )
        const screenshotPath = process.env['PIVOT_E2E_SCREENSHOT_PATH']
        if (screenshotPath && mainWindow) {
          const screenshot = await mainWindow.webContents.capturePage()
          writeFileSync(screenshotPath, screenshot.toPNG())
        }
        const report = { ...result, passed: result.hasRoot && result.hasPreload && result.title === 'Pivot' && settingsPassed && workbenchPassed && localePassed && desktopPassed && timelinePassed && previewPassed && editorLazyPassed && runtimePassed && nowPassed && workPassed && projectPassed && automationPassed && extensionPassed && commandPalettePassed && newProjectPassed, readyMs: Date.now() - processStartedAt, screenshotPath }
        if (process.env['PIVOT_E2E_RESULT_PATH']) writeFileSync(process.env['PIVOT_E2E_RESULT_PATH'], JSON.stringify(report), 'utf8')
        app.exit(report.passed ? 0 : 1)
      }).catch((error: unknown) => {
        if (process.env['PIVOT_E2E_RESULT_PATH']) writeFileSync(process.env['PIVOT_E2E_RESULT_PATH'], JSON.stringify({ error: error instanceof Error ? error.message : String(error), passed: false }), 'utf8')
        app.exit(1)
      })
    })
  }
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  configurePreviewHost(mainWindow.webContents)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url, trustedRendererUrl)) event.preventDefault()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(trustedRendererUrl)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    clearTimeout(revealTimer)
    mainWindow = null
  })
}

void app.whenReady().then(async () => {
  traceStartup('app-ready')
  Menu.setApplicationMenu(null)
  traceStartup('menu-ready')
  configurePreviewSession(session.fromPartition(PREVIEW_PARTITION))
  traceStartup('preview-session-ready')
  const userDataPath = app.getPath('userData')
  traceStartup('user-data-path', userDataPath)
  try {
    mkdirSync(userDataPath, { recursive: true })
    traceStartup('user-data-ready')
  } catch (error) {
    traceStartup('user-data-failed', error)
    console.error('Pivot could not prepare its user-data directory:', error)
  }
  try {
    traceStartup('updates-create-start')
    applicationUpdates = new ApplicationUpdateService({
      currentVersion: APP_RELEASE_VERSION,
      enabled: existsSync(path.join(process.resourcesPath, 'app-update.yml')),
      isPackaged: app.isPackaged,
      onState: (state) => BrowserWindow.getAllWindows().forEach((window) => window.webContents.send('update:state', state)),
    })
    traceStartup('updates-created')
    applicationUpdates.start()
    traceStartup('updates-started')
    traceStartup('runtime-create-start')
    const startup = initializeStartupRuntime(
      path.join(userDataPath, 'pivot.sqlite'),
      (databasePath) => {
        traceStartup('ipc-register-start', databasePath)
        const runtime = registerIpcHandlers({
          databasePath,
          userDataPath,
          trace: traceStartup,
          trustedRendererUrl: rendererEntryUrl(process.env['ELECTRON_RENDERER_URL'], __dirname),
          updates: applicationUpdates ?? undefined,
        })
        traceStartup('ipc-register-finished')
        return runtime
      },
    )
    ipcRuntime = startup.runtime
    await startup.runtime.ready
    traceStartup('runtime-ready')
    if (startup.recovered) {
      console.error(
        `Pivot could not open its persistent database and started with temporary storage: ${startup.primaryError?.message ?? 'unknown error'}`,
      )
    }
  } catch (error) {
    traceStartup('runtime-failed', error)
    console.error('Pivot could not initialize its runtime:', error)
  }
  traceStartup('window-create-start')
  createWindow()
  traceStartup('window-created')
  setupDesktopPresence()
  traceStartup('desktop-presence-ready')
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else {
      desktopPresence?.showWindow()
    }
  })
}).catch((error: unknown) => {
  traceStartup('startup-rejected', error)
  console.error('Pivot startup failed:', error)
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', async (event) => {
  if (runtimeClosedForQuit) return
  event.preventDefault()
  try {
    await ipcRuntime?.close()
  } catch (error) {
    traceStartup('runtime-close-failed', error)
    console.error('Pivot could not cleanly close its runtime:', error)
  }
  ipcRuntime = null
  desktopPresence?.dispose()
  desktopPresence = null
  tray?.destroy()
  tray = null
  runtimeClosedForQuit = true
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !tray) {
    app.quit()
  }
})
