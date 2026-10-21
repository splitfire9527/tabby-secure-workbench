import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { LoggingConfig } from '../config/config.model'
import { SecureCrtLogOptions } from './session-log-options.model'
import { resolveLogFilename, LogTemplateVariables } from './log-template'
import { AuditWriter } from './audit-writer'
import { VisibleTextFilter } from './visible-text-filter'

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

export type LoggerConfigInput = any

/**
 * SessionLogger handles recording terminal sessions to disk with line-buffered
 * transcript output, optional timestamps, raw bytes diagnostics, and size rotation.
 * Fully supports SecureCRT Session Options - Log File specification.
 */
export class SessionLogger {
  private transcriptStream: fs.WriteStream | null = null
  private rawStream: fs.WriteStream | null = null
  private auditWriter: AuditWriter | null = null
  private lineBuffer = ''
  private visibleFilter = new VisibleTextFilter()
  private currentBytesWritten = 0
  private fileModeLocked = false
  private fullLogPath = ''
  private initialDay = new Date().getDate()

  readonly options: LoggerConfigInput

  constructor(
    config: LoggerConfigInput,
    readonly sessionMeta: { id: string; name: string; host?: string }
  ) {
    this.options = { ...config }
    this.initStreams()
  }

  get logFilePath(): string {
    return this.fullLogPath
  }

  private initStreams(): void {
    let targetDir = (this.options as LoggingConfig).directory
    if (!targetDir) {
      targetDir = path.join(os.homedir(), '.tabby-logs')
    }

    if (!fs.existsSync(targetDir)) {
      try {
        fs.mkdirSync(targetDir, { recursive: true, mode: 0o700 })
      } catch (err) {
        console.error('[SessionLogger] Failed to create log directory:', err)
      }
    }

    const rawTemplate =
      (this.options as SecureCrtLogOptions).logFileName ||
      (this.options as LoggingConfig).filenameTemplate ||
      '%H_%S_%Y%M%D_%h%m%s.log'

    const filename = resolveLogFilename(rawTemplate, {
      host: this.sessionMeta.host,
      sessionName: this.sessionMeta.name,
      date: new Date(),
    })

    this.fullLogPath = path.isAbsolute(rawTemplate)
      ? path.join(path.dirname(rawTemplate), filename)
      : path.join(targetDir, filename)
    this.fileModeLocked = false

    // Append vs Overwrite
    const isOverwrite =
      (this.options as SecureCrtLogOptions).mode === 'overwrite' ||
      (this.options as LoggingConfig).appendMode === 'overwrite'
    const flags = isOverwrite ? 'w' : 'a'

    // Open transcript stream
    try {
      this.transcriptStream = fs.createWriteStream(this.fullLogPath, {
        flags,
        mode: 0o600,
        encoding: 'utf-8',
      })
      this.transcriptStream.on('error', (err) => {
        console.error('[SessionLogger] Transcript stream error:', err)
      })
      this.fileModeLocked = true

      // Custom log data: Upon connect
      const uponConnect = (this.options as SecureCrtLogOptions).customLogData?.uponConnect
      if (uponConnect) {
        this.transcriptStream.write(`${uponConnect}\n`)
      }
    } catch (err) {
      console.error('[SessionLogger] Failed to create transcript stream:', err)
    }

    // Raw mode stream
    const isRaw =
      !!(this.options as SecureCrtLogOptions).rawLog ||
      (this.options as LoggingConfig).mode === 'raw'

    if (isRaw) {
      try {
        const rawPath = this.fullLogPath + '.raw'
        this.rawStream = fs.createWriteStream(rawPath, {
          flags,
          mode: 0o600,
        })
        this.rawStream.on('error', () => {})
      } catch (err) {
        console.error('[SessionLogger] Failed to create raw stream:', err)
      }
    }

    // Audit log
    try {
      const auditDir = path.dirname(this.fullLogPath)
      const auditPath = path.join(auditDir, `${this.sessionMeta.id}-audit.jsonl`)
      this.auditWriter = new AuditWriter(auditPath)
      this.auditWriter.writeEvent('session-connected', this.sessionMeta.id, this.sessionMeta.name, {
        host: this.sessionMeta.host,
        logFile: this.fullLogPath,
      })
    } catch (err) {
      console.error('[SessionLogger] Failed to init audit writer:', err)
    }
  }

  /**
   * Appends text to transcript with line buffering.
   * Cross-chunk partial lines are retained in lineBuffer until completed.
   */
  writeText(text: string): void {
    if (!this.transcriptStream) return

    // If configured to log only custom data, skip general terminal text
    if ((this.options as SecureCrtLogOptions).customLogData?.logOnlyCustomData) {
      return
    }

    const visible = this.visibleFilter.push(text)
    if (!visible) return
    this.lineBuffer += visible

    // Check for complete lines separated by \n or \r\n
    const lines = this.lineBuffer.split(/\r?\n/)
    if (lines.length > 1) {
      // The last element is the remaining incomplete line segment
      const incomplete = lines.pop() ?? ''

      const includeTs =
        !!(this.options as SecureCrtLogOptions).timestampEachLine ||
        !!(this.options as LoggingConfig).includeTimestamps
      const onEachLine = (this.options as SecureCrtLogOptions).customLogData?.onEachLine || ''

      for (const line of lines) {
        const cleanLine = line
        let formattedLine = ''
        if (includeTs) {
          formattedLine += `${formatTimestamp()} `
        }
        if (onEachLine) {
          formattedLine += `${onEachLine} `
        }
        formattedLine += `${cleanLine}\n`

        this.transcriptStream.write(formattedLine)
        this.currentBytesWritten += Buffer.byteLength(formattedLine, 'utf-8')
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
  /**
   * Append/overwrite is fixed once the file is open. Returns false when ignored.
   */
  setFileExistMode(mode: 'append' | 'overwrite'): boolean {
    if (this.fileModeLocked || this.transcriptStream) return false
    ;(this.options as LoggingConfig).appendMode = mode
    ;(this.options as SecureCrtLogOptions).mode = mode
    return true
  }

  flush(): void {
    const tail = this.visibleFilter.flush()
    if (tail) this.lineBuffer += tail
    if (this.transcriptStream && this.lineBuffer.length > 0) {
      if (!(this.options as SecureCrtLogOptions).customLogData?.logOnlyCustomData) {
        const cleanLine = this.lineBuffer
        const includeTs =
          !!(this.options as SecureCrtLogOptions).timestampEachLine ||
          !!(this.options as LoggingConfig).includeTimestamps
        const onEachLine = (this.options as SecureCrtLogOptions).customLogData?.onEachLine || ''

        let formattedLine = ''
        if (includeTs) {
          formattedLine += `${formatTimestamp()} `
        }
        if (onEachLine) {
          formattedLine += `${onEachLine} `
        }
        formattedLine += `${cleanLine}\n`

        this.transcriptStream.write(formattedLine)
      }
      this.lineBuffer = ''
    }
  }

  private checkRotation(): void {
    // 1. Midnight rotation check (SecureCRT: Start new log at midnight)
    if ((this.options as SecureCrtLogOptions).startNewLogAtMidnight) {
      const nowDay = new Date().getDate()
      if (nowDay !== this.initialDay) {
        this.initialDay = nowDay
        this.flush()
        if (this.transcriptStream) this.transcriptStream.end()
        if (this.rawStream) this.rawStream.end()
        this.currentBytesWritten = 0
        this.initStreams()
        return
      }
    }

    // 2. Size rotation check
    const maxMb = (this.options as LoggingConfig).maxFileSizeMB
    if (!maxMb || maxMb <= 0) return

    const maxBytes = maxMb * 1024 * 1024
    if (this.currentBytesWritten >= maxBytes) {
      this.flush()
      if (this.transcriptStream) {
        this.transcriptStream.end()
      }
      if (this.rawStream) {
        this.rawStream.end()
      }
      this.currentBytesWritten = 0
      this.initStreams()
    }
  }

  getAuditWriter(): AuditWriter | null {
    return this.auditWriter
  }

  async close(): Promise<void> {
    this.flush()

    // Custom log data: Upon disconnect
    const uponDisconnect = (this.options as SecureCrtLogOptions).customLogData?.uponDisconnect
    if (this.transcriptStream && uponDisconnect) {
      this.transcriptStream.write(`${uponDisconnect}\n`)
    }

    const promises: Promise<void>[] = []

    if (this.transcriptStream) {
      const ts = this.transcriptStream
      this.transcriptStream = null
      promises.push(new Promise((resolve) => ts.end(() => resolve())))
    }

    if (this.rawStream) {
      const rs = this.rawStream
      this.rawStream = null
      promises.push(new Promise((resolve) => rs.end(() => resolve())))
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
