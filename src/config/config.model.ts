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

export interface LoggingConfig {
  enabled: boolean
  directory: string
  filenameTemplate: string
  mode: 'transcript' | 'raw' | 'audit'
  appendMode: 'append' | 'overwrite'
  includeTimestamps: boolean
  maxFileSizeMB: number
  retentionDays: number
}

export interface WorkbenchConfig {
  hideNativeSFTPButton: boolean
  defaultEncoding: WorkbenchEncoding
  dockHeight: number
  autoExpandDockOnRunning: boolean
  commandLibrary: SavedCommand[]
  directoryPairs: DirectoryPair[]
  logging: LoggingConfig
  crossTransferTempDir?: string
}

export const DEFAULT_WORKBENCH_CONFIG: WorkbenchConfig = {
  hideNativeSFTPButton: false,
  defaultEncoding: 'UTF-8',
  dockHeight: 140,
  autoExpandDockOnRunning: true,
  commandLibrary: [
    {
      id: 'cmd-top',
      category: 'Diagnostics',
      name: 'System Monitor (top)',
      snippet: 'top',
      autoExecute: true,
    },
    {
      id: 'cmd-df',
      category: 'Diagnostics',
      name: 'Disk Usage (df -h)',
      snippet: 'df -h',
      autoExecute: true,
    },
    {
      id: 'cmd-dmesg',
      category: 'Diagnostics',
      name: 'Kernel Messages (dmesg -T)',
      snippet: 'dmesg -T | tail -n 50',
      autoExecute: false,
    },
    {
      id: 'cmd-docker-ps',
      category: 'Docker',
      name: 'List Containers',
      snippet: 'docker ps --format "table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}"',
      autoExecute: true,
    },
  ],
  directoryPairs: [],
  logging: {
    enabled: false,
    directory: '',
    filenameTemplate: '%Y%M%D_%h%m%s_%S.log',
    mode: 'transcript',
    appendMode: 'append',
    includeTimestamps: true,
    maxFileSizeMB: 50,
    retentionDays: 30,
  },
  crossTransferTempDir: '',
}
