export interface SftpAuditEvent {
  timestamp: string
  action: 'start' | 'conflict-decision' | 'complete' | 'fail' | 'cancel'
  taskId: string
  sourcePath: string
  targetPath: string
  details?: Record<string, any>
}

export function createSftpAuditEvent(
  action: SftpAuditEvent['action'],
  taskId: string,
  sourcePath: string,
  targetPath: string,
  details?: Record<string, any>
): SftpAuditEvent {
  return {
    timestamp: new Date().toISOString(),
    action,
    taskId,
    sourcePath,
    targetPath,
    details,
  }
}
