import * as fs from 'fs'
import * as path from 'path'
import { LoggingConfig } from '../config/config.model'
import { resolveLogFilename, LogTemplateVariables } from './log-template'
import { AuditWriter } from './audit-writer'

/**
 * Strips ANSI/OSC escape sequences while preserving exact displayable text characters.
 */
export function stripAnsiEscapeSequences(str: string): string {
  return str
    // OSC sequences (\x1b] ... \x07 or \x1b\ ... )
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '')
    // CSI sequences (\x1b[ ... [a-zA-Z])
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
    // Other escape codes
    .replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, '')
    .replace(/\x1b[@-Z\\-_]/g, '')
}

/**
 * Formats a Date object into standard timestamp string [YYYY-MM-DD HH:mm:ss].
 */
export function formatTimestamp(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  return `[${y}-${m}-${d} ${h}:${min}:${s}]`
}

/**
 * SessionLogger handles recording terminal sessions to disk with line-buffered
 * transcript output, optional timestamps, raw bytes diagnostics, and size rotation.
 */
export class SessionLogger {
  private transcriptStream: fs.WriteStream | null = null
  private rawStream: fs.WriteStream | null = null
  private auditWriter: AuditWriter | null = null
  private lineBuffer = ''
  private currentBytesWritten = 0
  private fullLogPath = ''

  constructor(
    readonly config: LoggingConfig,
    readonly sessionMeta: { id: string; name: string; host?: string }
  ) {
    this.initStreams()
  }

  get logFilePath(): string {
    return this.fullLogPath
  }

  private initStreams(): void {
    if (!this.config.directory) return

    if (!fs.existsSync(this.config.directory)) {
      fs.mkdirSync(this.config.directory, { recursive: true, mode: 0o700 })
    }

    const filename = resolveLogFilename(this.config.filenameTemplate, {
      host: this.sessionMeta.host,
      sessionName: this.sessionMeta.name,
      date: new Date(),
    })

    this.fullLogPath = path.join(this.config.directory, filename)
    const flags = this.config.appendMode === 'append' ? 'a' : 'w'

    if (this.config.mode === 'transcript' || this.config.mode === 'audit') {
      this.transcriptStream = fs.createWriteStream(this.fullLogPath, {
        flags,
        mode: 0o600,
        encoding: 'utf-8',
      })
      this.transcriptStream.on('error', () => {})
    }

    if (this.config.mode === 'raw') {
      const rawPath = this.fullLogPath + '.raw'
      this.rawStream = fs.createWriteStream(rawPath, {
        flags,
        mode: 0o600,
      })
      this.rawStream.on('error', () => {})
    }

    const auditPath = path.join(this.config.directory, `${this.sessionMeta.id}-audit.jsonl`)
    this.auditWriter = new AuditWriter(auditPath)
    this.auditWriter.writeEvent('session-connected', this.sessionMeta.id, this.sessionMeta.name, {
      host: this.sessionMeta.host,
      logFile: this.fullLogPath,
    })
  }

  /**
   * Appends text to transcript with line buffering.
   * Cross-chunk partial lines are retained in lineBuffer until completed.
   */
  writeText(text: string): void {
    if (!this.transcriptStream) return

    // Feed text into line buffer
    this.lineBuffer += text

    // Check for complete lines separated by \n or \r\n
    const lines = this.lineBuffer.split(/\r?\n/)
    if (lines.length > 1) {
      // The last element is the remaining incomplete line segment
      const incomplete = lines.pop() ?? ''

      for (const line of lines) {
        const cleanLine = stripAnsiEscapeSequences(line)
        const lineWithTs = this.config.includeTimestamps
          ? `${formatTimestamp()} ${cleanLine}\n`
          : `${cleanLine}\n`

        this.transcriptStream.write(lineWithTs)
        this.currentBytesWritten += Buffer.byteLength(lineWithTs, 'utf-8')
      }

      this.lineBuffer = incomplete
      this.checkRotation()
    }
  }

  /**
   * Writes raw bytes when raw diagnosis mode is active.
   */
  writeRawBytes(data: Buffer): void {
    if (this.rawStream) {
      this.rawStream.write(data)
    }
  }

  /**
   * Flushes any remaining incomplete line in lineBuffer.
   */
  flush(): void {
    if (this.transcriptStream && this.lineBuffer.length > 0) {
      const cleanLine = stripAnsiEscapeSequences(this.lineBuffer)
      const lineWithTs = this.config.includeTimestamps
        ? `${formatTimestamp()} ${cleanLine}\n`
        : `${cleanLine}\n`

      this.transcriptStream.write(lineWithTs)
      this.lineBuffer = ''
    }
  }

  private checkRotation(): void {
    if (!this.config.maxFileSizeMB || this.config.maxFileSizeMB <= 0) return

    const maxBytes = this.config.maxFileSizeMB * 1024 * 1024
    if (this.currentBytesWritten >= maxBytes) {
      this.flush()
      if (this.transcriptStream) {
        this.transcriptStream.end()
      }
      // Re-init with new timestamped filename
      this.currentBytesWritten = 0
      this.initStreams()
    }
  }

  getAuditWriter(): AuditWriter | null {
    return this.auditWriter
  }

  async close(): Promise<void> {
    this.flush()

    const promises: Promise<void>[] = []

    if (this.transcriptStream) {
      const ts = this.transcriptStream
      this.transcriptStream = null
      promises.push(new Promise(resolve => ts.end(() => resolve())))
    }

    if (this.rawStream) {
      const rs = this.rawStream
      this.rawStream = null
      promises.push(new Promise(resolve => rs.end(() => resolve())))
    }

    if (this.auditWriter) {
      this.auditWriter.writeEvent('session-disconnected', this.sessionMeta.id, this.sessionMeta.name, {
        totalBytesWritten: this.currentBytesWritten,
      })
      promises.push(this.auditWriter.close())
      this.auditWriter = null
    }

    await Promise.all(promises)
  }
}
