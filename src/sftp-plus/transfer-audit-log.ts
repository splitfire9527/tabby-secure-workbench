import * as fs from 'fs'
import * as path from 'path'
import { AuditWriter } from '../session-logging/audit-writer'
import { SftpAuditEvent, createSftpAuditEvent } from './sftp-audit-events'

/**
 * Writes transfer audit events to a JSONL file.
 * It has no terminal transcript handle, so paths and contents cannot be copied into a session log.
 */
export class TransferAuditLog {
  private writer: AuditWriter

  constructor(
    readonly filePath: string,
    private sessionId = 'sftp',
    private sessionName = 'sftp'
  ) {
    this.writer = new AuditWriter(filePath)
  }

  record(
    action: SftpAuditEvent['action'],
    taskId: string,
    sourcePath: string,
    targetPath: string,
    details?: Record<string, any>
  ): SftpAuditEvent {
    const event = createSftpAuditEvent(action, taskId, sourcePath, targetPath, details)
    const type =
      action === 'start'
        ? 'transfer-started'
        : action === 'complete'
          ? 'transfer-completed'
          : action === 'fail'
            ? 'transfer-failed'
            : action === 'cancel'
              ? 'transfer-cancelled'
              : 'sftp-action'
    this.writer.writeEvent(type, this.sessionId, this.sessionName, {
      action: event.action,
      taskId: event.taskId,
      sourcePath: event.sourcePath,
      targetPath: event.targetPath,
      ...(event.details || {}),
    })
    return event
  }

  async close(): Promise<void> {
    await this.writer.close()
  }
}

export function readAuditLines(filePath: string): any[] {
  if (!fs.existsSync(filePath)) return []
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line))
}

export function auditFilePath(directory: string): string {
  return path.join(directory, 'sftp-transfer-audit.jsonl')
}
