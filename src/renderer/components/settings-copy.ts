import type { Locale } from '../i18n/locale'
import type { SettingsGroupId, SettingsSectionId } from './settings-contract'

type CoreCopy = { back: string; categories: string; search: string; settings: string }

const CORE_COPY: Record<Locale, CoreCopy> = {
  en: { back: 'Back', categories: 'Settings categories', search: 'Search settings', settings: 'Settings' },
  'zh-CN': { back: '返回', categories: '设置分类', search: '搜索设置', settings: '设置' },
  ja: { back: '戻る', categories: '設定カテゴリ', search: '設定を検索', settings: '設定' },
  de: { back: 'Zurück', categories: 'Einstellungskategorien', search: 'Einstellungen suchen', settings: 'Einstellungen' },
  es: { back: 'Volver', categories: 'Categorías de ajustes', search: 'Buscar ajustes', settings: 'Ajustes' },
  ko: { back: '뒤로', categories: '설정 카테고리', search: '설정 검색', settings: '설정' },
  fr: { back: 'Retour', categories: 'Catégories de réglages', search: 'Rechercher un réglage', settings: 'Réglages' },
  pt: { back: 'Voltar', categories: 'Categorias de definições', search: 'Pesquisar definições', settings: 'Definições' },
  ru: { back: 'Назад', categories: 'Категории настроек', search: 'Поиск настроек', settings: 'Настройки' },
}

const SECTION_COPY: Record<Locale, Record<SettingsSectionId, string>> = {
  en: { general: 'General', appearance: 'Appearance', providers: 'Models & Providers', runtimes: 'Runtimes & CLI', agents: 'Agents', skills: 'Skills', commands: 'Slash Commands', mcp: 'MCP & Connectors', plugins: 'Plugins', downloads: 'Downloads', automations: 'Automations', privacy: 'Privacy & Security', data: 'Data & Storage', updates: 'Updates', shortcuts: 'Shortcuts', advanced: 'Advanced', feedback: 'Feedback', about: 'About' },
  'zh-CN': { general: '通用', appearance: '外观', providers: '模型与提供商', runtimes: '运行时与 CLI', agents: '智能体', skills: '技能', commands: '斜杠命令', mcp: 'MCP 与连接器', plugins: '插件', downloads: '下载源', automations: '自动化', privacy: '隐私与安全', data: '数据与存储', updates: '更新', shortcuts: '快捷键', advanced: '高级', feedback: '反馈', about: '关于' },
  ja: { general: '一般', appearance: '外観', providers: 'モデルとプロバイダー', runtimes: 'ランタイムと CLI', agents: 'エージェント', skills: 'スキル', commands: 'スラッシュコマンド', mcp: 'MCP とコネクター', plugins: 'プラグイン', downloads: 'ダウンロード', automations: '自動化', privacy: 'プライバシーとセキュリティ', data: 'データとストレージ', updates: 'アップデート', shortcuts: 'ショートカット', advanced: '詳細設定', feedback: 'フィードバック', about: 'Pivot について' },
  de: { general: 'Allgemein', appearance: 'Darstellung', providers: 'Modelle & Anbieter', runtimes: 'Laufzeiten & CLI', agents: 'Agenten', skills: 'Skills', commands: 'Slash-Befehle', mcp: 'MCP & Konnektoren', plugins: 'Plugins', downloads: 'Downloads', automations: 'Automatisierungen', privacy: 'Datenschutz & Sicherheit', data: 'Daten & Speicher', updates: 'Updates', shortcuts: 'Tastenkürzel', advanced: 'Erweitert', feedback: 'Feedback', about: 'Über Pivot' },
  es: { general: 'General', appearance: 'Apariencia', providers: 'Modelos y proveedores', runtimes: 'Entornos y CLI', agents: 'Agentes', skills: 'Habilidades', commands: 'Comandos slash', mcp: 'MCP y conectores', plugins: 'Complementos', downloads: 'Descargas', automations: 'Automatizaciones', privacy: 'Privacidad y seguridad', data: 'Datos y almacenamiento', updates: 'Actualizaciones', shortcuts: 'Atajos', advanced: 'Avanzado', feedback: 'Comentarios', about: 'Acerca de' },
  ko: { general: '일반', appearance: '모양', providers: '모델 및 공급자', runtimes: '런타임 및 CLI', agents: '에이전트', skills: '스킬', commands: '슬래시 명령', mcp: 'MCP 및 커넥터', plugins: '플러그인', downloads: '다운로드', automations: '자동화', privacy: '개인정보 및 보안', data: '데이터 및 저장소', updates: '업데이트', shortcuts: '바로가기', advanced: '고급', feedback: '피드백', about: '정보' },
  fr: { general: 'Général', appearance: 'Apparence', providers: 'Modèles et fournisseurs', runtimes: 'Environnements et CLI', agents: 'Agents', skills: 'Compétences', commands: 'Commandes slash', mcp: 'MCP et connecteurs', plugins: 'Extensions', downloads: 'Téléchargements', automations: 'Automatisations', privacy: 'Confidentialité et sécurité', data: 'Données et stockage', updates: 'Mises à jour', shortcuts: 'Raccourcis', advanced: 'Avancé', feedback: 'Commentaires', about: 'À propos' },
  pt: { general: 'Geral', appearance: 'Aparência', providers: 'Modelos e fornecedores', runtimes: 'Ambientes e CLI', agents: 'Agentes', skills: 'Competências', commands: 'Comandos slash', mcp: 'MCP e conectores', plugins: 'Plugins', downloads: 'Transferências', automations: 'Automações', privacy: 'Privacidade e segurança', data: 'Dados e armazenamento', updates: 'Atualizações', shortcuts: 'Atalhos', advanced: 'Avançado', feedback: 'Comentários', about: 'Acerca' },
  ru: { general: 'Общие', appearance: 'Оформление', providers: 'Модели и провайдеры', runtimes: 'Среды и CLI', agents: 'Агенты', skills: 'Навыки', commands: 'Slash-команды', mcp: 'MCP и коннекторы', plugins: 'Плагины', downloads: 'Загрузки', automations: 'Автоматизация', privacy: 'Конфиденциальность и безопасность', data: 'Данные и хранилище', updates: 'Обновления', shortcuts: 'Сочетания клавиш', advanced: 'Дополнительно', feedback: 'Обратная связь', about: 'О программе' },
}

const GROUP_COPY: Record<Locale, Record<SettingsGroupId, string>> = {
  en: { basics: 'BASICS', execution: 'AI & EXECUTION', extensions: 'EXTENSIONS', marketplace: 'MARKETPLACE', automation: 'AUTOMATION', security: 'SECURITY & DATA', application: 'APPLICATION' },
  'zh-CN': { basics: '基础', execution: 'AI 与执行', extensions: '扩展', marketplace: '资源源', automation: '自动化', security: '安全与数据', application: '应用' },
  ja: { basics: '基本', execution: 'AI と実行', extensions: '拡張', marketplace: 'マーケット', automation: '自動化', security: 'セキュリティとデータ', application: 'アプリ' },
  de: { basics: 'GRUNDLAGEN', execution: 'KI & AUSFÜHRUNG', extensions: 'ERWEITERUNGEN', marketplace: 'MARKTPLATZ', automation: 'AUTOMATISIERUNG', security: 'SICHERHEIT & DATEN', application: 'ANWENDUNG' },
  es: { basics: 'BÁSICO', execution: 'IA Y EJECUCIÓN', extensions: 'EXTENSIONES', marketplace: 'CATÁLOGO', automation: 'AUTOMATIZACIÓN', security: 'SEGURIDAD Y DATOS', application: 'APLICACIÓN' },
  ko: { basics: '기본', execution: 'AI 및 실행', extensions: '확장', marketplace: '마켓', automation: '자동화', security: '보안 및 데이터', application: '애플리케이션' },
  fr: { basics: 'BASES', execution: 'IA ET EXÉCUTION', extensions: 'EXTENSIONS', marketplace: 'CATALOGUE', automation: 'AUTOMATISATION', security: 'SÉCURITÉ ET DONNÉES', application: 'APPLICATION' },
  pt: { basics: 'BÁSICO', execution: 'IA E EXECUÇÃO', extensions: 'EXTENSÕES', marketplace: 'CATÁLOGO', automation: 'AUTOMAÇÃO', security: 'SEGURANÇA E DADOS', application: 'APLICAÇÃO' },
  ru: { basics: 'ОСНОВНЫЕ', execution: 'ИИ И ВЫПОЛНЕНИЕ', extensions: 'РАСШИРЕНИЯ', marketplace: 'КАТАЛОГ', automation: 'АВТОМАТИЗАЦИЯ', security: 'БЕЗОПАСНОСТЬ И ДАННЫЕ', application: 'ПРИЛОЖЕНИЕ' },
}

export function getSettingsCopy(locale: Locale) {
  return { ...CORE_COPY[locale], group: (id: SettingsGroupId) => GROUP_COPY[locale][id], section: (id: SettingsSectionId) => SECTION_COPY[locale][id] }
}
