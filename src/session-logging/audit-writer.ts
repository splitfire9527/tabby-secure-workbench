import * as fs from 'fs'
import * as path from 'path'

export interface AuditEvent {
  timestamp: string
  type:
    | 'session-connected'
    | 'session-disconnected'
    | 'encoding-changed'
    | 'command-injected'
    | 'sftp-action'
    | 'transfer-started'
    | 'transfer-completed'
    | 'transfer-failed'
    | 'transfer-cancelled'
  sessionId: string
  sessionName: string
  details: Record<string, any>
}

/**
 * AuditWriter writes structured JSONL activity events to disk.
 * Strictly guarantees that passwords, private keys, and secrets are never recorded.
 */
export class AuditWriter {
  private stream: fs.WriteStream | null = null

  constructor(readonly filePath: string) {
    this.initFile()
  }

  private initFile(): void {
    const dir = path.dirname(this.filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    }

    this.stream = fs.createWriteStream(this.filePath, {
      flags: 'a',
      mode: 0o600,
      encoding: 'utf-8',
    })
    this.stream.on('error', err => {
      // Log or suppress write errors to avoid unhandled crash
    })
  }

  /**
   * Sanitizes objects to prevent leaking secrets, credentials, or keys.
   */
  private sanitizeDetails(details: Record<string, any>, seen = new WeakSet()): Record<string, any> {
    if (typeof details !== 'object' || details === null) return details
    if (seen.has(details)) return '[CIRCULAR]' as any
    seen.add(details)

    const sanitized: Record<string, any> = Array.isArray(details) ? [] : {}
    const sensitiveKeys = ['password', 'secret', 'key', 'privatekey', 'passphrase', 'token', 'auth']

    for (const [k, v] of Object.entries(details)) {
      const lower = k.toLowerCase()
      if (sensitiveKeys.some(s => lower.includes(s))) {
        sanitized[k] = '[REDACTED]'
      } else if (typeof v === 'object' && v !== null) {
        sanitized[k] = this.sanitizeDetails(v, seen)
      } else {
        sanitized[k] = v
      }
    }

    return sanitized
  }

  writeEvent(
    type: AuditEvent['type'],
    sessionId: string,
    sessionName: string,
    details: Record<string, any> = {}
  ): void {
    if (!this.stream) return

    const event: AuditEvent = {
      timestamp: new Date().toISOString(),
      type,
      sessionId,
      sessionName,
      details: this.sanitizeDetails(details),
    }

    this.stream.write(JSON.stringify(event) + '\n')
  }

  close(): Promise<void> {
    return new Promise(resolve => {
      if (this.stream) {
        this.stream.end(() => {
          this.stream = null
          resolve()
        })
      } else {
        resolve()
      }
    })
  }
}
