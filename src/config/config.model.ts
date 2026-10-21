/**
 * Configuration data models and default definitions for Tabby Secure Workbench.
 */

export interface SavedCommand {
  id: string
  category: string
  name: string
  snippet: string
  autoExecute: boolean
}

export interface DirectoryPair {
  id: string
  title: string
  localPath?: string
  remotePath?: string
}

export type WorkbenchEncoding = 'UTF-8' | 'GBK' | 'GB2312' | 'GB18030' | 'BIG5'
export type FrameworkTheme = 'default' | 'dark' | 'system' | 'tabby' | string
export type UILanguage = 'auto' | 'zh-CN' | 'en-US' | 'tabby'

export interface CustomThemeScheme {
  name: string
  surface: string
  background: string
  border: string
  text: string
  primary: string
  accent?: string
}

export interface SecureCrtLoggingSettings {
  enabled?: boolean
  startLogUponConnect: boolean
  promptForFilename: boolean
  logFileName: string
  mode: 'transcript' | 'raw'
  appendMode: 'append' | 'overwrite'
  directory: string
  startNewLogAtMidnight?: boolean
  timestampEachLine?: boolean
  customLogData?: {
    uponConnect?: string
    uponDisconnect?: string
    onEachLine?: string
  }
}

export interface LoggingConfig {
  enabled: boolean
  directory: string
  filenameTemplate: string
  mode: 'transcript' | 'raw' | 'audit'
  appendMode: 'append' | 'overwrite'
  includeTimestamps: boolean
  maxFileSizeMB: number
  retentionDays: number
  startNewLogAtMidnight?: boolean
  rawLog?: boolean
  customLogData?: {
    uponConnect?: string
    uponDisconnect?: string
    onEachLine?: string
  }
}

export interface FileTransferConfig {
  defaultLocalPath: string
  defaultRemotePath: string
  pathMode: 'off' | 'remember' | 'sync'
  showHiddenFiles: boolean
  conflictAction: 'prompt' | 'overwrite' | 'skip'
  doubleClickAction: 'view' | 'transfer'
  confirmDelete: boolean
  dockHeight: number
  autoExpandDockOnRunning: boolean
  maxConcurrentTransfers: number
}

export interface SidebarVisibilityConfig {
  sessions: boolean
  commands: boolean
  sftp: boolean
  settings: boolean
}

export interface StartupConfig {
  maximizeOnStartup: boolean
  openSidebarOnStartup: boolean
  defaultSidebarTab: 'sessions' | 'commands' | 'sftp'
}

export interface DefaultSessionConfig {
  encoding: WorkbenchEncoding
  terminalType: string
  colorScheme?: string
  closeTabOnExit?: boolean
  logging: SecureCrtLoggingSettings
  sftp: {
    preferredDockMode: 'bottom' | 'right' | 'full' | 'undock'
    autoOpenSFTP: boolean
    initialLocalPath?: string
    initialRemotePath?: string
  }
  directoryPairs: DirectoryPair[]
}

export interface SessionWorkbenchConfig {
  encoding?: WorkbenchEncoding | 'inherit'
  terminalType?: string
  colorScheme?: string
  closeTabOnExit?: boolean
  logging?: Partial<SecureCrtLoggingSettings>
  sftp?: {
    preferredDockMode?: 'bottom' | 'right' | 'full' | 'undock'
    autoOpenSFTP?: boolean
    initialLocalPath?: string
    initialRemotePath?: string
  }
  directoryPairs?: DirectoryPair[]
}

export interface TabContextMenuConfig {
  duplicate: boolean
  restart: boolean
  rename: boolean
  pin: boolean
  color: boolean
  split: boolean
  copyPath: boolean
  saveLayout: boolean
  newTerminal: boolean
  focusAllTabs: boolean
  focusAllPanes: boolean
  disconnect: boolean
  closeOthers: boolean
  closeRight: boolean
  closeLeft: boolean
  close: boolean
}

export interface WorkbenchConfig {
  frameworkTheme: FrameworkTheme
  customThemes?: CustomThemeScheme[]
  activeCustomTheme?: string
  uiLanguage: UILanguage
  hideNativeSFTPButton: boolean
  defaultEncoding: WorkbenchEncoding
  dockHeight: number
  autoExpandDockOnRunning: boolean
  showTabIndices: boolean
  showTabCloseButton: boolean
  alwaysShowTabCloseButton?: boolean
  showBuiltinSessions?: boolean
  showImportedSessions?: boolean
  hideSavedRootWhenSole?: boolean
  sidebarWidth?: number
  tabContextMenu: TabContextMenuConfig
  commandLibrary: SavedCommand[]
  directoryPairs: DirectoryPair[]
  logging: LoggingConfig
  defaultSession: DefaultSessionConfig
  closeTabOnExit?: boolean
  colorScheme?: string
  fileTransfer: FileTransferConfig
  pathMemory?: Record<string, { localPath: string; remotePath: string }>
  bookmarks?: { id: string; profileId: string; side: 'local' | 'remote'; path: string; title: string }[]
  sidebarVisibility: SidebarVisibilityConfig
  startup: StartupConfig
  crossTransferTempDir?: string
}

export const DEFAULT_WORKBENCH_CONFIG: WorkbenchConfig = {
  frameworkTheme: 'default',
  customThemes: [],
  activeCustomTheme: '',
  uiLanguage: 'auto',
  hideNativeSFTPButton: false,
  defaultEncoding: 'UTF-8',
  dockHeight: 140,
  autoExpandDockOnRunning: true,
  showTabIndices: false,
  showTabCloseButton: false,
  alwaysShowTabCloseButton: false,
  showBuiltinSessions: false,
  showImportedSessions: true,
  hideSavedRootWhenSole: true,
  sidebarWidth: 300,
  tabContextMenu: {
    duplicate: true,
    restart: true,
    rename: true,
    pin: true,
    color: true,
    split: true,
    copyPath: true,
    saveLayout: true,
    newTerminal: true,
    focusAllTabs: true,
    focusAllPanes: true,
    disconnect: true,
    closeOthers: true,
    closeRight: true,
    closeLeft: true,
    close: true,
  },
  commandLibrary: [
    {
      id: 'cmd-top',
      category: '系统诊断',
      name: '系统监控 (top)',
      snippet: 'top',
      autoExecute: true,
    },
    {
      id: 'cmd-df',
      category: '系统诊断',
      name: '磁盘使用 (df -h)',
      snippet: 'df -h',
      autoExecute: true,
    },
    {
      id: 'cmd-dmesg',
      category: '系统诊断',
      name: '内核日志 (dmesg -T)',
      snippet: 'dmesg -T | tail -n 50',
      autoExecute: false,
    },
    {
      id: 'cmd-docker-ps',
      category: '容器运维',
      name: '容器列表 (docker ps)',
      snippet: 'docker ps --format "table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}"',
      autoExecute: true,
    },
  ],
  directoryPairs: [],
  logging: {
    enabled: false,
    directory: '',
    filenameTemplate: '%H_%S_%Y%M%D_%h%m%s.log',
    mode: 'transcript',
    appendMode: 'append',
    includeTimestamps: true,
    maxFileSizeMB: 50,
    retentionDays: 30,
    startNewLogAtMidnight: false,
    rawLog: false,
    customLogData: {
      uponConnect: '',
      uponDisconnect: '',
      onEachLine: '',
    },
  },
  closeTabOnExit: false,
  defaultSession: {
    encoding: 'UTF-8',
    terminalType: 'xterm-256color',
    colorScheme: 'SecureCRT System Color Scheme',
    closeTabOnExit: false,
    logging: {
      startLogUponConnect: false,
      promptForFilename: false,
      logFileName: '%H_%S_%Y%M%D_%h%m%s.log',
      mode: 'transcript',
      appendMode: 'append',
      directory: '',
      startNewLogAtMidnight: false,
      timestampEachLine: false,
      customLogData: {
        uponConnect: '',
        uponDisconnect: '',
        onEachLine: '',
      },
    },
    sftp: {
      preferredDockMode: 'bottom',
      autoOpenSFTP: false,
      initialLocalPath: '',
      initialRemotePath: '/root',
    },
    directoryPairs: [],
  },
  fileTransfer: {
    defaultLocalPath: '',
    defaultRemotePath: '/root',
    pathMode: 'remember',
    showHiddenFiles: false,
    conflictAction: 'prompt',
    doubleClickAction: 'view',
    confirmDelete: true,
    dockHeight: 180,
    autoExpandDockOnRunning: true,
    maxConcurrentTransfers: 3,
  },
  sidebarVisibility: {
    sessions: true,
    commands: true,
    sftp: true,
    settings: true,
  },
  startup: {
    maximizeOnStartup: false,
    openSidebarOnStartup: true,
    defaultSidebarTab: 'sessions',
  },
  crossTransferTempDir: '',
}
