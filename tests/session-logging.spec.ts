import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  resolveLogFilename,
  sanitizeFilenameComponent,
} from '../src/session-logging/log-template'
import { SessionLogger } from '../src/session-logging/session-logger'
import { AuditWriter } from '../src/session-logging/audit-writer'

describe('Session Logging Layer (§6)', () => {
  describe('Log Template Resolution and Path Security', () => {
    it('should replace all supported tokens correctly', () => {
      const fixedDate = new Date(2026, 8, 17, 14, 30, 45) // 2026-09-17 14:30:45
      const template = '%Y-%M-%D_%h-%m-%s_%H_%S.log'

      const filename = resolveLogFilename(template, {
        host: 'prod-server.internal',
        sessionName: 'DB-Primary',
        date: fixedDate,
      })

      expect(filename).toBe('2026-09-17_14-30-45_prod-server.internal_DB-Primary.log')
    })

    it('should strictly sanitize illegal filename characters and path traversal attempts', () => {
      const traversalHost = '../../etc/passwd'
      const maliciousSession = 'session/../../../bin/bash'

      const filename = resolveLogFilename('%H_%S.log', {
        host: traversalHost,
        sessionName: maliciousSession,
      })

      expect(filename).not.toContain('/')
      expect(filename).not.toContain('\\')
      expect(filename).not.toContain('..')
      expect(path.basename(filename)).toBe(filename)
    })
  })

  describe('Split control sequences stay out of the transcript', () => {
    let tempDir: string

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-log-split-'))
    })

    afterEach(() => {
      if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true })
    })

    it('drops a CSI sequence that arrives in two chunks and keeps the visible text', async () => {
      const logger = new SessionLogger(
        {
          enabled: true,
          directory: tempDir,
          filenameTemplate: 'split.log',
          mode: 'transcript',
          appendMode: 'append',
          includeTimestamps: false,
        },
        { id: 'split-1', name: 'split' }
      )

      logger.writeText('\x1b[31')
      logger.writeText('mHELLO\x1b[0m\n')
      logger.flush()
      await logger.close()

      const content = fs.readFileSync(logger.logFilePath, 'utf-8')
      expect(content).toContain('HELLO')
      expect(content).not.toContain('\x1b')
      expect(content).not.toContain('[31')
    })

    it('does not create a raw byte file unless raw diagnosis is enabled', async () => {
      const logger = new SessionLogger(
        {
          enabled: true,
          directory: tempDir,
          filenameTemplate: 'plain.log',
          mode: 'transcript',
          appendMode: 'append',
          includeTimestamps: false,
        },
        { id: 'raw-off', name: 'raw-off' }
      )
      logger.writeText('visible only\n')
      await logger.close()
      expect(fs.existsSync(logger.logFilePath + '.raw')).toBe(false)
      expect(fs.readFileSync(logger.logFilePath, 'utf-8')).toContain('visible only')
    })

    it('writes raw bytes to a separate file when raw diagnosis is on', async () => {
      const logger = new SessionLogger(
        {
          enabled: true,
          directory: tempDir,
          filenameTemplate: 'raw.log',
          mode: 'raw',
          appendMode: 'append',
          includeTimestamps: false,
        },
        { id: 'raw-on', name: 'raw-on' }
      )
      logger.writeText('visible\n')
      logger.writeRawBytes(Buffer.from([0x1b, 0x5b, 0x33, 0x31, 0x6d]))
      await logger.close()
      const raw = fs.readFileSync(logger.logFilePath + '.raw')
      expect(raw[0]).toBe(0x1b)
      expect(fs.readFileSync(logger.logFilePath, 'utf-8')).not.toContain('\x1b')
    })

    it('refuses to switch append or overwrite after the log file is open', async () => {
      const logger = new SessionLogger(
        {
          enabled: true,
          directory: tempDir,
          filenameTemplate: 'mode.log',
          mode: 'transcript',
          appendMode: 'append',
          includeTimestamps: false,
        },
        { id: 'mode-1', name: 'mode' }
      )
      logger.writeText('one\n')
      expect(logger.setFileExistMode('overwrite')).toBe(false)
      logger.writeText('two\n')
      await logger.close()
      const content = fs.readFileSync(logger.logFilePath, 'utf-8')
      expect(content).toContain('one')
      expect(content).toContain('two')
    })
  })

  describe('Line Buffering & File Output', () => {
    let tempDir: string

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-log-test-'))
    })

    afterEach(() => {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
    })

    it('should buffer partial lines across chunks and write on newline', async () => {
      const logger = new SessionLogger(
        {
          enabled: true,
          directory: tempDir,
          filenameTemplate: 'test-%S.log',
          mode: 'transcript',
          appendMode: 'append',
          includeTimestamps: false,
          maxFileSizeMB: 10,
          retentionDays: 7,
        },
        { id: 'sess-1', name: 'demo' }
      )

      logger.writeText('Hello ')
      logger.writeText('World!')

      // Before newline, not written yet
      logger.writeText('\n')

      logger.writeText('Second Line (pending)')
      logger.flush()
      await logger.close()

      const content = fs.readFileSync(logger.logFilePath, 'utf-8')
      expect(content).toBe('Hello World!\nSecond Line (pending)\n')
    })

    it('should enforce 0600 file permissions on POSIX', async () => {
      if (process.platform === 'win32') return // POSIX mode check

      const logger = new SessionLogger(
        {
          enabled: true,
          directory: tempDir,
          filenameTemplate: 'perm-test.log',
          mode: 'transcript',
          appendMode: 'append',
          includeTimestamps: false,
          maxFileSizeMB: 10,
          retentionDays: 7,
        },
        { id: 'sess-perm', name: 'perm' }
      )

      logger.writeText('Secure Content\n')
      await logger.close()

      const stat = fs.statSync(logger.logFilePath)
      const mode = stat.mode & 0o777
      expect(mode).toBe(0o600)
    })
  })

  describe('Audit Writer Secret Redaction (§7)', () => {
    let tempDir: string

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-audit-test-'))
    })

    afterEach(() => {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
    })

    it('should redact passwords, tokens, and private keys from JSONL audit logs', async () => {
      const auditFile = path.join(tempDir, 'audit.jsonl')
      const writer = new AuditWriter(auditFile)

      writer.writeEvent('session-connected', 's-1', 'ProdServer', {
        user: 'admin',
        password: 'SuperSecretPassword123!',
        token: 'eyJh...jwtToken',
        privateKey: '-----BEGIN RSA PRIVATE KEY-----',
        host: '10.0.0.1',
      })

      await writer.close()

      const lines = fs.readFileSync(auditFile, 'utf-8').trim().split('\n')
      expect(lines.length).toBe(1)

      const parsed = JSON.parse(lines[0])
      expect(parsed.details.user).toBe('admin')
      expect(parsed.details.host).toBe('10.0.0.1')
      expect(parsed.details.password).toBe('[REDACTED]')
      expect(parsed.details.token).toBe('[REDACTED]')
      expect(parsed.details.privateKey).toBe('[REDACTED]')
    })
  })
})
