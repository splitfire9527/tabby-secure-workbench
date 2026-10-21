import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import { spawn } from 'child_process'
import { TransferStore } from '../transfer-store/transfer-store'

export interface TarChannelDeps {
  hasSsh: () => boolean
  getSshSession: () => any
  getSftpSession: () => any
}

export const TAR_OK = 'TAR_STREAM_OK_7f2b'
export const REMOTE_TAR_TIMEOUT_MS = 30000

/**
 * Executes a single command on the remote host using Tabby's SSH session channel.
 */
export async function execSshCommand(sshSession: any, command: string, timeoutMs = 12000): Promise<string> {
  const ssh = sshSession?.ssh
  if (!ssh?.openSessionChannel || !ssh?.activateChannel) {
    return ''
  }

  const execOnce = async (): Promise<string> => {
    let channel: any = null
    try {
      const newCh = await ssh.openSessionChannel()
      channel = await ssh.activateChannel(newCh)
      await channel.requestExec(command)

      const chunks: Buffer[] = []
      let channelClosed = false

      await new Promise<void>((resolve, reject) => {
        let settled = false
        let timer: any = null
        let dataSub: any = null
        let closedSub: any = null

        const done = (err?: any) => {
          if (settled) return
          settled = true
          if (timer != null) clearTimeout(timer)
          try {
            dataSub?.unsubscribe?.()
          } catch {}
          try {
            closedSub?.unsubscribe?.()
          } catch {}
          if (err !== undefined) reject(err)
          else resolve()
        }

        dataSub = channel.data$?.subscribe({
          next: (d: any) => chunks.push(Buffer.from(d)),
          error: (err: any) => done(err),
        })

        closedSub = channel.closed$?.subscribe(() => {
          channelClosed = true
          done()
        })

        timer = setTimeout(() => {
          if (!channelClosed) {
            try {
              channel?.close?.()
            } catch {}
          }
          done()
        }, timeoutMs)
      })

      return Buffer.concat(chunks).toString('utf8')
    } catch {
      return ''
    } finally {
      try {
        await channel?.close?.()
      } catch {}
    }
  }

  const first = await execOnce()
  if (first !== '') return first
  // Retry once if first output is empty
  return execOnce()
}

/**
 * Escapes POSIX shell argument safely.
 */
export function shellQuotePosix(str: string): string {
  if (str.length === 0) return "''"
  if (/^[a-zA-Z0-9_\.\-\/]+$/.test(str)) return str
  return `'${str.replace(/'/g, "'\\''")}'`
}

/**
 * TarChannel provides high-speed directory packaging and extraction via tar,
 * avoiding thousands of small network round-trips over SFTP.
 * Aligned with Tabby-SFTP-Plus TarChannel.
 */
export class TarChannel {
  private localTarOk: boolean | null = null
  private remoteTarOk: boolean | null = null

  constructor(private deps: TarChannelDeps) {}

  /**
   * Probes if local system has a working tar executable (Win10+ includes bsdtar).
   */
  async localTarAvailable(): Promise<boolean> {
    if (this.localTarOk !== null) return this.localTarOk
    this.localTarOk = await new Promise<boolean>((resolve) => {
      try {
        const child = spawn('tar', ['--version'])
        let settled = false
        const done = (ok: boolean) => {
          if (!settled) {
            settled = true
            resolve(ok)
          }
        }
        child.on('error', () => done(false))
        child.on('close', (code) => done(code === 0))
        setTimeout(() => {
          try {
            child.kill()
          } catch {}
          done(false)
        }, 5000)
      } catch {
        resolve(false)
      }
    })
    return this.localTarOk
  }

  /**
   * Probes if remote system has a working tar executable.
   */
  async remoteTarAvailable(): Promise<boolean> {
    if (this.remoteTarOk !== null) return this.remoteTarOk
    const ssh = this.deps.getSshSession()
    if (!ssh) {
      this.remoteTarOk = false
      return false
    }
    try {
      const out = await execSshCommand(ssh, 'command -v tar || which tar', 5000)
      this.remoteTarOk = /\btar\b/.test(out)
    } catch {
      this.remoteTarOk = false
    }
    return this.remoteTarOk
  }

  /**
   * Recursively calculates directory size and file count locally.
   */
  scanLocalDir(dirPath: string): { size: number; filesCount: number } {
    let size = 0
    let filesCount = 0

    const scan = (p: string) => {
      try {
        const entries = fs.readdirSync(p, { withFileTypes: true })
        for (const e of entries) {
          const full = path.join(p, e.name)
          if (e.isDirectory() && !e.name.endsWith('.asar')) {
            scan(full)
          } else {
            try {
              const st = fs.statSync(full)
              size += st.size
              filesCount++
            } catch {}
          }
        }
      } catch {}
    }

    scan(dirPath)
    return { size, filesCount }
  }

  /**
   * Attempts to upload directory using local tar.gz compression -> SFTP -> remote untar.
   * Returns 'succeeded' on success, 'fallback' if tar acceleration fails or is unavailable.
   */
  async tryUploadDir(
    localPath: string,
    remoteTarget: string,
    store: TransferStore,
    taskId: string
  ): Promise<'succeeded' | 'fallback'> {
    if (!this.deps.hasSsh()) return 'fallback'
    if (localPath.includes('\0') || remoteTarget.includes('\0')) return 'fallback'

    const localOk = await this.localTarAvailable()
    const remoteOk = await this.remoteTarAvailable()
    if (!localOk || !remoteOk) return 'fallback'

    const ssh = this.deps.getSshSession()
    const sftp = this.deps.getSftpSession()
    if (!ssh || !sftp) return 'fallback'

    const parentLocal = path.dirname(localPath)
    const baseName = path.basename(localPath)
    const parentRemote = path.posix.dirname(remoteTarget)

    const randomSuffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`
    const tmpDir = path.join(os.tmpdir(), `sftp-tar-${randomSuffix}`)
    try {
      fs.mkdirSync(tmpDir, { recursive: true })
    } catch {
      return 'fallback'
    }

    const tarFile = path.join(tmpDir, `${baseName}.tar.gz`)
    const remoteTar = path.posix.join(parentRemote, `.sftp-tar-${randomSuffix}.tar.gz`)
    const remoteExtractDir = path.posix.join(parentRemote, `.sftp-untar-${randomSuffix}`)

    try {
      // 1. Local pack into tar.gz
      const packOk = await new Promise<boolean>((resolve) => {
        const p = spawn('tar', ['-czf', tarFile, '-C', parentLocal, baseName])
        p.on('error', () => resolve(false))
        p.on('close', (code) => resolve(code === 0))
        setTimeout(() => {
          try {
            p.kill()
          } catch {}
          resolve(false)
        }, 60000)
      })

      if (!packOk || !fs.existsSync(tarFile)) {
        return 'fallback'
      }

      const stat = fs.statSync(tarFile)
      const tarSize = stat.size
      if (tarSize <= 0) return 'fallback'

      // 2. SFTP upload of single tar.gz
      const handle = await sftp.open(remoteTar, 2 | 8 | 16)
      const fd = fs.openSync(tarFile, 'r')
      const buf = Buffer.alloc(64 * 1024)
      let pos = 0
      let bytesRead = 0

      try {
        while ((bytesRead = fs.readSync(fd, buf, 0, buf.length, pos)) > 0) {
          await handle.write(buf.subarray(0, bytesRead))
          pos += bytesRead
          store.updateProgress(taskId, Math.min(pos, tarSize))
        }
      } finally {
        try { fs.closeSync(fd) } catch {}
        try { await handle.close() } catch {}
      }

      // 3. Remote extract via SSH
      const remoteBackup = `${remoteTarget}.old.${Date.now()}`
      const extractCmd =
        `mkdir -p ${shellQuotePosix(remoteExtractDir)} ` +
        `&& tar xzf ${shellQuotePosix(remoteTar)} -C ${shellQuotePosix(remoteExtractDir)} ` +
        `&& test -e ${shellQuotePosix(path.posix.join(remoteExtractDir, baseName))} ` +
        `&& (test ! -e ${shellQuotePosix(remoteTarget)} || mv ${shellQuotePosix(remoteTarget)} ${shellQuotePosix(remoteBackup)}) ` +
        `&& mv ${shellQuotePosix(path.posix.join(remoteExtractDir, baseName))} ${shellQuotePosix(remoteTarget)} ` +
        `&& rm -rf ${shellQuotePosix(remoteBackup)} ${shellQuotePosix(remoteExtractDir)} ${shellQuotePosix(remoteTar)} ` +
        `&& echo ${TAR_OK}`

      const out = await execSshCommand(ssh, extractCmd, REMOTE_TAR_TIMEOUT_MS)
      if (!out.includes(TAR_OK)) {
        // Cleanup attempt
        await execSshCommand(ssh, `rm -rf ${shellQuotePosix(remoteExtractDir)} ${shellQuotePosix(remoteTar)}`, 5000).catch(() => {})
        return 'fallback'
      }

      return 'succeeded'
    } catch {
      return 'fallback'
    } finally {
      // Clean up local temp tar
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      } catch {}
    }
  }

  /**
   * Attempts to download directory using remote tar.gz -> SFTP -> local untar.
   */
  async tryDownloadDir(
    remoteSrc: string,
    localDest: string,
    store: TransferStore,
    taskId: string
  ): Promise<'succeeded' | 'fallback'> {
    if (!this.deps.hasSsh()) return 'fallback'
    const localOk = await this.localTarAvailable()
    const remoteOk = await this.remoteTarAvailable()
    if (!localOk || !remoteOk) return 'fallback'

    const ssh = this.deps.getSshSession()
    const sftp = this.deps.getSftpSession()
    if (!ssh || !sftp) return 'fallback'

    const parentRemote = path.posix.dirname(remoteSrc)
    const baseName = path.posix.basename(remoteSrc)
    const randomSuffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`
    const remoteTar = path.posix.join(parentRemote, `.sftp-dl-tar-${randomSuffix}.tar.gz`)
    const tmpDir = path.join(os.tmpdir(), `sftp-dl-${randomSuffix}`)

    try {
      fs.mkdirSync(tmpDir, { recursive: true })
    } catch {
      return 'fallback'
    }

    const localTar = path.join(tmpDir, `${baseName}.tar.gz`)

    try {
      // 1. Remote pack into tar.gz
      const packCmd =
        `tar czf ${shellQuotePosix(remoteTar)} -C ${shellQuotePosix(parentRemote)} ${shellQuotePosix(baseName)} ` +
        `&& test -f ${shellQuotePosix(remoteTar)} && echo ${TAR_OK}`
      const out = await execSshCommand(ssh, packCmd, REMOTE_TAR_TIMEOUT_MS)
      if (!out.includes(TAR_OK)) {
        await execSshCommand(ssh, `rm -f ${shellQuotePosix(remoteTar)}`, 5000).catch(() => {})
        return 'fallback'
      }

      // 2. Download tar.gz via SFTP
      const handle = await sftp.open(remoteTar, 1)
      const fd = fs.openSync(localTar, 'w')
      let pos = 0
      try {
        while (true) {
          const chunk = await handle.read()
          if (!chunk || chunk.length === 0) break
          fs.writeSync(fd, Buffer.from(chunk))
          pos += chunk.length
          store.updateProgress(taskId, pos)
        }
      } finally {
        try { fs.closeSync(fd) } catch {}
        try { await handle.close() } catch {}
      }

      // Cleanup remote tar
      await execSshCommand(ssh, `rm -f ${shellQuotePosix(remoteTar)}`, 5000).catch(() => {})

      // 3. Local unpack
      const localParent = path.dirname(localDest)
      fs.mkdirSync(localParent, { recursive: true })
      const unpackOk = await new Promise<boolean>((resolve) => {
        const p = spawn('tar', ['-xzf', localTar, '-C', localParent])
        p.on('error', () => resolve(false))
        p.on('close', (code) => resolve(code === 0))
        setTimeout(() => {
          try {
            p.kill()
          } catch {}
          resolve(false)
        }, 60000)
      })

      if (!unpackOk) return 'fallback'
      return 'succeeded'
    } catch {
      return 'fallback'
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      } catch {}
    }
  }
}
