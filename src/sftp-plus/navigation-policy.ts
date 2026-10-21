export type PathMode = 'off' | 'remember' | 'sync'
export type BookmarkSide = 'local' | 'remote'

export interface StoredPaths {
  localPath: string
  remotePath: string
}

export interface SftpBookmark {
  id: string
  profileId: string
  side: BookmarkSide
  path: string
  title: string
}

export const PREVIEW_MAX_BYTES = 256 * 1024

export interface StartPathInput {
  mode: PathMode
  defaultLocal: string
  defaultRemote: string
  remembered?: StoredPaths | null
  workingDirectory?: string | null
}

export function resolveStartPaths(input: StartPathInput): StoredPaths & { needsWorkingDirectory: boolean } {
  const defaults: StoredPaths = {
    localPath: input.defaultLocal || '',
    remotePath: input.defaultRemote || '/',
  }
  if (input.mode === 'off') {
    return { ...defaults, needsWorkingDirectory: false }
  }
  const remembered = input.remembered
  if (input.mode === 'remember') {
    return {
      localPath: remembered?.localPath || defaults.localPath,
      remotePath: remembered?.remotePath || defaults.remotePath,
      needsWorkingDirectory: false,
    }
  }
  if (input.workingDirectory) {
    return {
      localPath: remembered?.localPath || defaults.localPath,
      remotePath: input.workingDirectory,
      needsWorkingDirectory: false,
    }
  }
  return {
    localPath: remembered?.localPath || defaults.localPath,
    remotePath: remembered?.remotePath || defaults.remotePath,
    needsWorkingDirectory: true,
  }
}

export function validateDirectoryPair(localPath: string, remotePath: string): string | null {
  if (!localPath.trim() && !remotePath.trim()) {
    return '成对目录的本地路径和远程路径不能同时为空'
  }
  return null
}

export function applyPartialPair(
  current: StoredPaths,
  pair: { localPath?: string; remotePath?: string }
): StoredPaths {
  return {
    localPath: pair.localPath?.trim() ? pair.localPath : current.localPath,
    remotePath: pair.remotePath?.trim() ? pair.remotePath : current.remotePath,
  }
}

export function applyBookmark(current: StoredPaths, bookmark: SftpBookmark): StoredPaths {
  if (bookmark.side === 'local') {
    return { localPath: bookmark.path, remotePath: current.remotePath }
  }
  return { localPath: current.localPath, remotePath: bookmark.path }
}

export type PreviewOutcome = 'preview' | 'transfer' | 'too-large' | 'not-text'

export function previewOutcome(
  doubleClickAction: 'view' | 'transfer',
  file: { isDirectory: boolean; size: number; textLike: boolean }
): PreviewOutcome {
  if (file.isDirectory || doubleClickAction === 'transfer') return 'transfer'
  if (file.size > PREVIEW_MAX_BYTES) return 'too-large'
  if (!file.textLike) return 'not-text'
  return 'preview'
}

export function looksLikeText(sample: Buffer): boolean {
  if (sample.includes(0)) return false
  return true
}

export const SFTP_CONTEXT_ACTIONS = [
  'download',
  'upload',
  'remote-copy',
  'remote-paste',
  'rename',
  'chmod',
  'delete',
  'bookmark',
  'refresh',
] as const

export function offersCrossConnectionSync(actions: readonly string[]): boolean {
  return actions.some(action => /sync|增量比对|目录同步/i.test(action))
}
