export type ConflictAction = 'prompt' | 'overwrite' | 'skip'
export type ConflictDecision = 'overwrite' | 'skip' | 'cancel'

export function isMissingRemoteFile(err: any): boolean {
  if (!err) return false
  if (err.code === 2 || err.code === 'ENOENT' || err.type === 'NO_SUCH_FILE') return true
  const message = String(err.message || '')
  return (
    message.includes('not found') ||
    message.includes('No such file') ||
    message.includes('does not exist')
  )
}

/**
 * Resolves what to do when the remote target already exists.
 * `prompt` does not write; the caller must wait for an explicit decision.
 */
export function decideConflict(
  action: ConflictAction,
  prompted: ConflictDecision | null
): ConflictDecision {
  if (action === 'skip') return 'skip'
  if (action === 'overwrite') return 'overwrite'
  return prompted ?? 'cancel'
}
