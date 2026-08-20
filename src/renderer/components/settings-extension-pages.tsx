import { Box, Braces, Brush, Code2, Database, Download, FileCode2, FileImage, FileText, GitBranch, Globe2, Image, Lightbulb, Network, Package, Play, Plug, Plus, Presentation, Search, Server, Sparkles, Terminal, Video } from 'lucide-react'
import { useState, type ReactElement, type ReactNode } from 'react'
import { useLocale } from '../i18n/locale-context'
import { ActionButton, ListItem, SelectControl, SettingRow, SettingsPage, SettingsSection, Tag, Toggle, useStoredSetting } from './settings-controls'

type CatalogEntry = { description: string; icon: ReactNode; id: string; name: string; tags: string[]; version?: string }

const BUILTIN_SKILLS: CatalogEntry[] = [
  { id: 'code', name: 'Code Generation', description: 'Multi-file code scaffolding and refactoring', icon: <Code2 size={16} />, tags: ['Code', 'Built-in'], version: '3.2.0' },
  { id: 'research', name: 'Web Research', description: 'Search and summarize web content', icon: <Globe2 size={16} />, tags: ['Web', 'Built-in'], version: '2.1.0' },
  { id: 'files', name: 'File Analysis', description: 'Parse and analyze documents and media', icon: <FileText size={16} />, tags: ['Files', 'Built-in'], version: '1.5.1' },
  { id: 'vision', name: 'Image Understanding', description: 'Describe and analyze images', icon: <FileImage size={16} />, tags: ['Vision', 'Built-in'], version: '2.0.0' },
  { id: 'transform', name: 'Data Transform', description: 'Convert between formats (JSON, CSV, XML, YAML)', icon: <Braces size={16} />, tags: ['Data', 'Code', 'Built-in'], version: '1.3.0' },
]

const COMMUNITY_SKILLS: CatalogEntry[] = [
  { id: 'api-docs', name: 'API Doc Generator', description: 'Generate OpenAPI specs from code', icon: <FileCode2 size={16} />, tags: ['Code', 'Docs'], version: '1.0.3' },
  { id: 'tests', name: 'Test Scaffolder', description: 'Create test files from source modules', icon: <Sparkles size={16} />, tags: ['Code', 'Test'], version: '0.9.1' },
  { id: 'changelog', name: 'Changelog Writer', description: 'Generate changelogs from git history', icon: <GitBranch size={16} />, tags: ['Git', 'Docs'], version: '1.2.0' },
  { id: 'react-perf', name: 'React Perf Skill', description: 'Automated React performance audit', icon: <Play size={16} />, tags: ['Code', 'Web'], version: '2.0.0' },
]

export function SkillsSettingsPage(): ReactElement {
  const { locale } = useLocale(); const zh = locale === 'zh-CN'
  const [enabled, setEnabled] = useStoredSetting<Record<string, boolean>>('skills-enabled', Object.fromEntries(BUILTIN_SKILLS.map((skill) => [skill.id, true])))
  const [autoSelect, setAutoSelect] = useStoredSetting('skills-auto-select', true)
  const [timeout, setTimeout] = useStoredSetting('skills-timeout', '60')
  const [parallel, setParallel] = useStoredSetting('skills-parallel', true)
  const [context, setContext] = useStoredSetting('skills-context', '8192')
  const [output, setOutput] = useStoredSetting('skills-output', 'markdown')
  const [showActivity, setShowActivity] = useStoredSetting('skills-show-activity', true)
  function toggle(id: string): void { setEnabled({ ...enabled, [id]: !(enabled[id] ?? false) }) }
  return <SettingsPage description={zh ? '管理智能体可调用的能力、执行限制和结果呈现方式。' : 'Manage capabilities agents can invoke, execution limits, and result presentation.'} title={zh ? '技能' : 'Skills'}>
    <SettingsSection title={zh ? '内置技能' : 'BUILT-IN SKILLS'}>{BUILTIN_SKILLS.map((skill) => <CatalogListItem enabled={enabled[skill.id] ?? false} key={skill.id} onToggle={() => toggle(skill.id)} {...skill} />)}</SettingsSection>
    <SettingsSection title={zh ? '社区技能' : 'COMMUNITY SKILLS'}>{COMMUNITY_SKILLS.map((skill) => <CatalogListItem enabled={enabled[skill.id] ?? true} key={skill.id} onToggle={() => toggle(skill.id)} removable {...skill} />)}</SettingsSection>
    <SettingsSection title={zh ? '技能设置' : 'SKILL SETTINGS'}>
      <SettingRow description={zh ? '让智能体为每项任务选择合适的技能' : 'Let agent choose appropriate skills per task'} label={zh ? '自动选择技能' : 'Auto-select skills'}><Toggle checked={autoSelect} label="Auto-select skills" onChange={setAutoSelect} /></SettingRow>
      <SettingRow description={zh ? '每次技能执行允许的最长时间' : 'Maximum time per skill execution'} label={zh ? '技能执行超时' : 'Skill execution timeout'}><SelectControl ariaLabel="Skill execution timeout" onChange={setTimeout} options={[['30', '30s'], ['60', '60s'], ['120', '120s']]} value={timeout} /></SettingRow>
      <SettingRow description={zh ? '允许同时运行多个技能' : 'Allow multiple skills simultaneously'} label={zh ? '并行技能' : 'Parallel skills'}><Toggle checked={parallel} label="Parallel skills" onChange={setParallel} /></SettingRow>
      <SettingRow description={zh ? '单个技能可消耗的最大令牌数' : 'Maximum tokens a skill can consume'} label={zh ? '最大上下文窗口' : 'Max context window'}><SelectControl ariaLabel="Max context window" onChange={setContext} options={[['4096', '4,096'], ['8192', '8,192'], ['16384', '16,384']]} value={context} /></SettingRow>
      <SettingRow description={zh ? '技能结果的默认输出格式' : 'Default output format for skill results'} label={zh ? '技能输出格式' : 'Skill output format'}><SelectControl ariaLabel="Skill output format" onChange={setOutput} options={[['markdown', 'Markdown'], ['json', 'JSON'], ['text', zh ? '纯文本' : 'Plain text']]} value={output} /></SettingRow>
      <SettingRow description={zh ? '在侧栏显示技能执行日志' : 'Display skill execution logs in sidebar'} label={zh ? '显示技能活动' : 'Show skill activity'}><Toggle checked={showActivity} label="Show skill activity" onChange={setShowActivity} /></SettingRow>
    </SettingsSection>
  </SettingsPage>
}

function CatalogListItem({ description, enabled, icon, name, onToggle, removable, tags, version }: CatalogEntry & { enabled: boolean; onToggle: () => void; removable?: boolean }): ReactElement {
  return <ListItem actions={<>{removable && <ActionButton>Remove</ActionButton>}<Toggle checked={enabled} label={`Enable ${name}`} onChange={onToggle} /></>} description={description} icon={icon} meta={<>{version && <Tag>v{version}</Tag>}{tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}</>} title={name} />
}

export function SlashCommandsSettingsPage(): ReactElement {
  const { locale } = useLocale(); const zh = locale === 'zh-CN'
  const [query, setQuery] = useState('')
  const commands = [
    ['/deploy', zh ? '将当前分支部署到生产环境' : 'Deploy the current branch to production environment', 'Shell'],
    ['/review', zh ? '为当前拉取请求打开代码审查清单' : 'Open a code review checklist for the current PR', 'Composite'],
    ['/test-all', zh ? '运行工作区中的全部单元与集成测试' : 'Run all unit and integration tests in the workspace', 'Shell'],
    ['/lint-fix', zh ? '运行 ESLint 和 Prettier 自动修复' : 'Run auto-fixers for ESLint and Prettier', 'Script'],
    ['/db-migrate', zh ? '将待处理的数据库迁移应用到预发布环境' : 'Apply pending database migrations to staging', 'Shell'],
    ['/sync-env', zh ? '同步本地环境变量与远程工作区' : 'Sync local environment variables with the remote workspace', 'Composite'],
    ['/backup', zh ? '创建当前工作区的完整备份' : 'Create a full backup of the current workspace', 'Script'],
  ].filter(([name, description]) => `${name} ${description}`.toLowerCase().includes(query.toLowerCase()))
  const [enabled, setEnabled] = useStoredSetting<Record<string, boolean>>('commands-enabled', {})
  return <SettingsPage actions={<ActionButton primary><Plus size={13} />{zh ? '新建命令' : 'New Command'}</ActionButton>} description={zh ? '创建和管理可在当前会话中快速调用的复用命令。' : 'Create and manage reusable commands that run in the current session.'} title={zh ? '斜杠命令' : 'Slash Commands'}>
    <label className="pv-settings-search"><Search size={14} /><input onChange={(event) => setQuery(event.target.value)} placeholder={zh ? '搜索命令' : 'Search commands'} value={query} /></label>
    <SettingsSection title={zh ? '自定义命令' : 'CUSTOM COMMANDS'}>{commands.map(([name, description, type]) => <ListItem actions={<><ActionButton>{zh ? '编辑' : 'Edit'}</ActionButton><ActionButton>{zh ? '删除' : 'Delete'}</ActionButton><Toggle checked={enabled[name] ?? true} label={`Enable ${name}`} onChange={(value) => setEnabled({ ...enabled, [name]: value })} /></>} description={description} icon={<Terminal size={16} />} key={name} meta={<Tag>{type}</Tag>} title={name} />)}</SettingsSection>
    <p className="pv-settings-footnote">{zh ? '斜杠命令在当前会话上下文中运行。使用 /help 查看全部可用命令。' : 'Slash commands run in the current session context. Use /help to see all available commands.'}</p>
  </SettingsPage>
}

export function McpSettingsPage(): ReactElement {
  const { locale } = useLocale(); const zh = locale === 'zh-CN'
  const builtIn: CatalogEntry[] = [
    { id: 'filesystem', name: 'Filesystem', description: zh ? '通过 MCP 读写本地文件系统' : 'Local file system read/write access via MCP', icon: <FolderIcon />, tags: ['12 tools', 'stdio', 'Built-in'] },
    { id: 'github', name: 'GitHub', description: zh ? '仓库、PR 和问题管理' : 'Repository, PR, and issue management', icon: <GitBranch size={16} />, tags: ['18 tools', 'stdio', 'Built-in'] },
    { id: 'postgres', name: 'PostgreSQL', description: zh ? '数据库查询与架构管理' : 'Database query and schema management', icon: <Database size={16} />, tags: ['8 tools', 'stdio', 'Built-in'] },
    { id: 'slack', name: 'Slack', description: zh ? '团队消息集成' : 'Team messaging integration', icon: <Network size={16} />, tags: ['6 tools', 'SSE', 'Built-in'] },
  ]
  const userServers: CatalogEntry[] = [
    { id: 'jira', name: 'Jira', description: zh ? '问题跟踪与项目管理' : 'Issue tracking and project management', icon: <Network size={16} />, tags: ['14 tools', 'SSE'] },
    { id: 'notion', name: 'Notion', description: zh ? '共享文档与 Wiki' : 'Shared documents and wikis', icon: <FileText size={16} />, tags: ['9 tools', 'SSE'] },
    { id: 'linear', name: 'Linear', description: zh ? '面向工程团队的问题跟踪' : 'Issue tracking for engineering teams', icon: <Network size={16} />, tags: ['11 tools', 'WebSocket'] },
    { id: 'confluence', name: 'Confluence', description: zh ? '团队知识库和文档' : 'Team knowledge base and documentation', icon: <FileText size={16} />, tags: ['7 tools', 'SSE'] },
  ]
  const [enabled, setEnabled] = useStoredSetting<Record<string, boolean>>('mcp-enabled', { filesystem: true })
  const [autoReconnect, setAutoReconnect] = useStoredSetting('mcp-auto-reconnect', true)
  const [timeout, setTimeout] = useStoredSetting('mcp-timeout', '30')
  const [confirmation, setConfirmation] = useStoredSetting('mcp-confirmation', 'destructive')
  const [concurrent, setConcurrent] = useStoredSetting('mcp-concurrent', '10')
  const [transport, setTransport] = useStoredSetting('mcp-transport', 'stdio')
  const [logging, setLogging] = useStoredSetting('mcp-logging', false)
  return <SettingsPage description={zh ? '管理 MCP 服务、传输方式、工具授权和连接行为。' : 'Manage MCP servers, transports, tool approvals, and connection behavior.'} title={zh ? 'MCP 与连接器' : 'MCP & Connectors'}>
    <SettingsSection title={zh ? '内置服务器' : 'BUILT-IN SERVERS'}>{builtIn.map((server) => <CatalogListItem enabled={enabled[server.id] ?? false} key={server.id} onToggle={( ) => setEnabled({ ...enabled, [server.id]: !(enabled[server.id] ?? false) })} {...server} />)}</SettingsSection>
    <SettingsSection title={zh ? '用户服务器' : 'USER SERVERS'}>{userServers.map((server) => <CatalogListItem enabled={enabled[server.id] ?? false} key={server.id} onToggle={() => setEnabled({ ...enabled, [server.id]: !(enabled[server.id] ?? false) })} removable {...server} />)}<button className="pv-settings-add-row" type="button"><span>+</span>{zh ? '添加 MCP 服务器' : 'Add MCP Server'}</button></SettingsSection>
    <SettingsSection title={zh ? '服务器设置' : 'SERVER SETTINGS'}>
      <SettingRow description={zh ? '自动重新连接断开的 MCP 服务器' : 'Reconnect to dropped MCP servers'} label={zh ? '自动重连' : 'Auto-reconnect'}><Toggle checked={autoReconnect} label="Auto-reconnect" onChange={setAutoReconnect} /></SettingRow>
      <SettingRow description={zh ? '等待服务器响应的最长时间' : 'Maximum time to wait for server response'} label={zh ? '连接超时' : 'Connection timeout'}><SelectControl ariaLabel="Connection timeout" onChange={setTimeout} options={[['15', '15s'], ['30', '30s'], ['60', '60s']]} value={timeout} /></SettingRow>
      <SettingRow description={zh ? '调用工具前要求批准' : 'Require approval for tool calls'} label={zh ? '工具确认' : 'Tool confirmation'}><SelectControl ariaLabel="Tool confirmation" onChange={setConfirmation} options={[['all', zh ? '全部' : 'All'], ['destructive', zh ? '仅破坏性操作' : 'Destructive only'], ['none', zh ? '无' : 'None']]} value={confirmation} /></SettingRow>
      <SettingRow description={zh ? '最大活动服务器连接数' : 'Maximum active server connections'} label={zh ? '最大并发连接' : 'Max concurrent connections'}><SelectControl ariaLabel="Max concurrent connections" onChange={setConcurrent} options={[['5', '5'], ['10', '10'], ['20', '20']]} value={concurrent} /></SettingRow>
      <SettingRow description={zh ? '新服务器使用的默认协议' : 'Default protocol for new servers'} label={zh ? '传输协议' : 'Transport protocol'}><SelectControl ariaLabel="Transport protocol" onChange={setTransport} options={[['stdio', 'stdio'], ['sse', 'SSE'], ['websocket', 'WebSocket']]} value={transport} /></SettingRow>
      <SettingRow description={zh ? '记录 MCP 请求和响应日志' : 'Record MCP request/response logs'} label={zh ? '记录服务器活动' : 'Log server activity'}><Toggle checked={logging} label="Log server activity" onChange={setLogging} /></SettingRow>
    </SettingsSection>
  </SettingsPage>
}

function FolderIcon(): ReactElement { return <Server size={16} /> }

export function PluginsSettingsPage(): ReactElement {
  const { locale } = useLocale(); const zh = locale === 'zh-CN'
  const builtIn: CatalogEntry[] = [
    { id: 'git', name: 'Git Integration', description: 'Branch, commit, and diff viewer', icon: <GitBranch size={16} />, tags: ['L2', 'Read + Write', 'Built-in'], version: '2.1.0' },
    { id: 'markdown', name: 'Markdown Preview', description: 'Live preview for .md files', icon: <FileText size={16} />, tags: ['L1', 'Read-only', 'Built-in'], version: '1.4.2' },
    { id: 'eslint', name: 'ESLint', description: 'JavaScript / TypeScript linting', icon: <Code2 size={16} />, tags: ['L1', 'Read-only', 'Built-in'], version: '3.0.1' },
    { id: 'prettier', name: 'Prettier', description: 'Code formatting on save', icon: <Brush size={16} />, tags: ['L2', 'Read + Write', 'Built-in'], version: '2.8.0' },
    { id: 'sqlite', name: 'SQLite Viewer', description: 'Browse local SQLite databases', icon: <Database size={16} />, tags: ['L1', 'Read-only', 'Built-in'], version: '1.1.0' },
  ]
  const community: CatalogEntry[] = [
    { id: 'tailwind', name: 'Tailwind Helper', description: 'Autocomplete for Tailwind classes', icon: <Brush size={16} />, tags: ['L1', 'Read-only'], version: '1.3.0' },
    { id: 'compose', name: 'Docker Compose Viewer', description: 'Visualize multi-container setups', icon: <Box size={16} />, tags: ['L3', 'Network'], version: '0.9.2' },
    { id: 'todo', name: 'TODO Highlighter', description: 'Highlight TODO and FIXME comments', icon: <Lightbulb size={16} />, tags: ['L1', 'Read-only'], version: '2.0.0' },
    { id: 'figma', name: 'Figma Integration', description: 'Import design files into code', icon: <Image size={16} />, tags: ['L4', 'Net + Assets'], version: '1.2.1' },
  ]
  const [enabled, setEnabled] = useStoredSetting<Record<string, boolean>>('plugins-enabled', Object.fromEntries(builtIn.map((plugin) => [plugin.id, true])))
  const [autoUpdate, setAutoUpdate] = useStoredSetting('plugins-auto-update', true)
  const [allowCommunity, setAllowCommunity] = useStoredSetting('plugins-community', true)
  const [sandbox, setSandbox] = useStoredSetting('plugins-sandbox', true)
  const [permission, setPermission] = useStoredSetting('plugins-permission', 'l3')
  const [timeout, setTimeout] = useStoredSetting('plugins-timeout', '60')
  const [prompts, setPrompts] = useStoredSetting('plugins-prompts', true)
  return <SettingsPage description={zh ? '管理内置与社区插件，以及沙箱和权限默认值。' : 'Manage built-in and community plugins, sandboxing, and permission defaults.'} title={zh ? '插件' : 'Plugins'}>
    <SettingsSection title={zh ? '内置插件' : 'BUILT-IN PLUGINS'}>{builtIn.map((plugin) => <CatalogListItem enabled={enabled[plugin.id] ?? true} key={plugin.id} onToggle={() => setEnabled({ ...enabled, [plugin.id]: !(enabled[plugin.id] ?? true) })} {...plugin} />)}</SettingsSection>
    <SettingsSection title={zh ? '社区插件' : 'COMMUNITY PLUGINS'}>{community.map((plugin) => <CatalogListItem enabled={enabled[plugin.id] ?? true} key={plugin.id} onToggle={() => setEnabled({ ...enabled, [plugin.id]: !(enabled[plugin.id] ?? true) })} removable {...plugin} />)}</SettingsSection>
    <SettingsSection title={zh ? '插件设置' : 'PLUGIN SETTINGS'}>
      <SettingRow description={zh ? '启动时自动更新插件' : 'Automatically update plugins on launch'} label={zh ? '自动更新插件' : 'Auto-update plugins'}><Toggle checked={autoUpdate} label="Auto-update plugins" onChange={setAutoUpdate} /></SettingRow>
      <SettingRow description={zh ? '允许从社区注册表安装插件' : 'Install plugins from community registry'} label={zh ? '允许社区插件' : 'Allow community plugins'}><Toggle checked={allowCommunity} label="Allow community plugins" onChange={setAllowCommunity} /></SettingRow>
      <SettingRow description={zh ? '隔离插件执行环境' : 'Isolate plugin execution environment'} label={zh ? '插件沙箱模式' : 'Plugin sandbox mode'}><Toggle checked={sandbox} label="Plugin sandbox mode" onChange={setSandbox} /></SettingRow>
      <SettingRow description={zh ? '可自动批准的最高权限级别' : 'Highest permission level to auto-approve'} label={zh ? '最高权限级别' : 'Maximum permission level'}><SelectControl ariaLabel="Maximum permission level" onChange={setPermission} options={[['l1', 'L1 Read-only'], ['l2', 'L2 Read + Write'], ['l3', 'L3 Network'], ['l4', 'L4 Net + Assets']]} value={permission} /></SettingRow>
      <SettingRow description={zh ? '空闲后终止插件进程' : 'Kill plugin process after inactivity'} label={zh ? '插件执行超时' : 'Plugin execution timeout'}><SelectControl ariaLabel="Plugin execution timeout" onChange={setTimeout} options={[['30', '30s'], ['60', '60s'], ['120', '120s']]} value={timeout} /></SettingRow>
      <SettingRow description={zh ? '授予新权限前显示提示' : 'Prompt before granting new permissions'} label={zh ? '显示权限提示' : 'Show permission prompts'}><Toggle checked={prompts} label="Show permission prompts" onChange={setPrompts} /></SettingRow>
    </SettingsSection>
  </SettingsPage>
}

export function DownloadsSettingsPage(): ReactElement {
  const { locale } = useLocale(); const zh = locale === 'zh-CN'
  const registries = [
    ['Official Registry', 'Plugin · Skill · Theme · Prompt', 'https://registry.pivot.dev/v1'],
    ['Community Mirror', 'Plugin · Skill · Theme · Prompt', 'https://mirror.pivot-community.org/v1'],
    ['Local Cache Server', 'Plugin · Skill', 'http://localhost:9821/registry'],
  ]
  const models = [
    ['Hugging Face', 'LLM · Image · Embed', 'https://huggingface.co/api/models'],
    ['Ollama Registry', 'LLM', 'http://localhost:11434'],
    ['OpenRouter Models', 'LLM · Vision', 'https://openrouter.ai/api/v1'],
    ['Civitai', 'Image · LoRA', 'https://civitai.com/api/v1'],
    ['Local Model Server', 'LLM · Custom', 'http://192.168.1.100:8080/models'],
  ]
  const [parallel, setParallel] = useStoredSetting('downloads-parallel', '3')
  const [bandwidth, setBandwidth] = useStoredSetting('downloads-bandwidth', 'unlimited')
  const [timeout, setTimeout] = useStoredSetting('downloads-timeout', '30')
  const [verification, setVerification] = useStoredSetting('downloads-verification', true)
  return <SettingsPage description={zh ? '管理注册源、模型来源、下载策略和完整性校验。' : 'Manage registries, model sources, download behavior, and integrity verification.'} title={zh ? '下载' : 'Downloads'}>
    <SettingsSection title={zh ? '注册表源' : 'REGISTRY SOURCES'}>{registries.map(([name, description, endpoint], index) => <ListItem actions={<><ActionButton>{zh ? '编辑' : 'Edit'}</ActionButton>{index > 0 && <ActionButton>{zh ? '移除' : 'Remove'}</ActionButton>}</>} description={endpoint} icon={<Package size={16} />} key={name} meta={<>{index === 0 && <Tag>Default</Tag>}{description.split(' · ').map((tag) => <Tag key={tag}>{tag}</Tag>)}</>} title={name} />)}<button className="pv-settings-add-row" type="button"><span>+</span>{zh ? '添加注册表源' : 'Add Registry Source'}</button></SettingsSection>
    <SettingsSection title={zh ? '模型源' : 'MODEL SOURCES'}>{models.map(([name, description, endpoint], index) => <ListItem actions={<><ActionButton>{zh ? '编辑' : 'Edit'}</ActionButton>{index > 0 && <ActionButton>{zh ? '移除' : 'Remove'}</ActionButton>}</>} description={endpoint} icon={<Box size={16} />} key={name} meta={<>{index === 0 && <Tag>Default</Tag>}{description.split(' · ').map((tag) => <Tag key={tag}>{tag}</Tag>)}</>} title={name} />)}<button className="pv-settings-add-row" type="button"><span>+</span>{zh ? '添加模型服务器' : 'Add Model Server'}</button></SettingsSection>
    <SettingsSection title={zh ? '下载' : 'DOWNLOAD'}>
      <SettingRow description={zh ? '并行下载的最大数量' : 'Maximum number of parallel downloads'} label={zh ? '并发下载' : 'Concurrent downloads'}><SelectControl ariaLabel="Concurrent downloads" onChange={setParallel} options={[["1", "1"], ["3", "3"], ["5", "5"]]} value={parallel} /></SettingRow>
      <SettingRow description={zh ? '限制下载速度（0 表示不限速）' : 'Limit download speed (0 = unlimited)'} label={zh ? '带宽限制' : 'Bandwidth limit'}><SelectControl ariaLabel="Bandwidth limit" onChange={setBandwidth} options={[['unlimited', zh ? '不限速' : 'Unlimited'], ['10', '10 MB/s'], ['50', '50 MB/s']]} value={bandwidth} /></SettingRow>
      <SettingRow description={zh ? '每次下载尝试的最长时间' : 'Max time per download attempt'} label={zh ? '下载超时' : 'Download timeout'}><SelectControl ariaLabel="Download timeout" onChange={setTimeout} options={[['15', '15s'], ['30', '30s'], ['60', '60s']]} value={timeout} /></SettingRow>
    </SettingsSection>
    <SettingsSection title={zh ? '验证与安全' : 'VERIFICATION & SECURITY'}><SettingRow description={zh ? '安装前验证包完整性' : 'Verify package integrity before installing'} label={zh ? 'SHA-256 签名验证' : 'SHA-256 signature verification'}><Toggle checked={verification} label="SHA-256 signature verification" onChange={setVerification} /></SettingRow></SettingsSection>
  </SettingsPage>
}
