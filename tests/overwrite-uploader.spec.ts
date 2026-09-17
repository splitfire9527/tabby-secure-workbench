import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  OverwriteUploader,
  RemoteSftpClient,
  RemoteFileStats,
} from '../src/sftp-plus/overwrite-uploader'

class MockRemoteSftpClient implements RemoteSftpClient {
  files = new Map<string, { mode: number; size: number; isSymlink: boolean; isDir: boolean }>()
  tempFilesCreated: string[] = []
  tempFilesUnlinked: string[] = []
  renamed: { from: string; to: string }[] = []
  chmodCalls: { path: string; mode: number }[] = []
  failOnRename = false

  async lstat(remotePath: string): Promise<RemoteFileStats> {
    const f = this.files.get(remotePath)
    if (!f) {
      throw new Error(`File not found: ${remotePath}`)
    }
    return {
      isSymbolicLink: () => f.isSymlink,
      isDirectory: () => f.isDir,
      mode: f.mode,
      size: f.size,
    }
  }

  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    const stats = fs.statSync(localPath)
    this.tempFilesCreated.push(remotePath)
    this.files.set(remotePath, {
      mode: 0o600,
      size: stats.size,
      isSymlink: false,
      isDir: false,
    })
  }

  async chmod(remotePath: string, mode: number): Promise<void> {
    this.chmodCalls.push({ path: remotePath, mode })
    const f = this.files.get(remotePath)
    if (f) f.mode = mode
  }

  async rename(oldRemotePath: string, newRemotePath: string): Promise<void> {
    if (this.failOnRename) {
      throw new Error('Simulated atomic rename failure (e.g. cross-device link)')
    }
    this.renamed.push({ from: oldRemotePath, to: newRemotePath })
    const f = this.files.get(oldRemotePath)
    if (f) {
      this.files.delete(oldRemotePath)
      this.files.set(newRemotePath, f)
    }
  }

  async unlink(remotePath: string): Promise<void> {
    this.tempFilesUnlinked.push(remotePath)
    this.files.delete(remotePath)
  }
}

describe('SFTP+ Overwrite Upload Algorithm (§4.2)', () => {
  let tempDir: string
  let localFile: string
  let uploader: OverwriteUploader

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overwrite-test-'))
    localFile = path.join(tempDir, 'payload.bin')
    fs.writeFileSync(localFile, 'NEW CONTENT V2')
    uploader = new OverwriteUploader()
  })

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('should preserve permission bits (e.g. 0755) when overwriting existing remote file', async () => {
    const client = new MockRemoteSftpClient()
    const targetPath = '/opt/bin/daemon'

    // Existing executable with mode 0755
    client.files.set(targetPath, {
      mode: 0o755,
      size: 100,
      isSymlink: false,
      isDir: false,
    })

    const result = await uploader.uploadWithAtomicOverwrite(client, localFile, targetPath)

    expect(result.success).toBe(true)
    expect(result.preservedMode).toBe(0o755)

    // chmod was called on temporary file with original mode 0755
    expect(client.chmodCalls.length).toBe(1)
    expect(client.chmodCalls[0].mode).toBe(0o755)

    // Final target exists with 0755 mode
    const finalStats = await client.lstat(targetPath)
    expect(finalStats.mode).toBe(0o755)
  })

  it('should refuse to overwrite symbolic links and leave symlink untouched', async () => {
    const client = new MockRemoteSftpClient()
    const symlinkPath = '/opt/bin/symlink'

    client.files.set(symlinkPath, {
      mode: 0o777,
      size: 10,
      isSymlink: true,
      isDir: false,
    })

    await expect(
      uploader.uploadWithAtomicOverwrite(client, localFile, symlinkPath)
    ).rejects.toThrow(/Refusing to overwrite symbolic link/)

    // Target still exists as symlink
    expect(client.files.get(symlinkPath)?.isSymlink).toBe(true)
    // No temp upload initiated
    expect(client.tempFilesCreated.length).toBe(0)
  })

  it('should rollback and delete temporary file when atomic rename fails', async () => {
    const client = new MockRemoteSftpClient()
    const targetPath = '/var/data/important.db'

    client.files.set(targetPath, {
      mode: 0o644,
      size: 500,
      isSymlink: false,
      isDir: false,
    })

    client.failOnRename = true

    await expect(
      uploader.uploadWithAtomicOverwrite(client, localFile, targetPath)
    ).rejects.toThrow(/Simulated atomic rename failure/)

    // Original target is intact
    expect(client.files.get(targetPath)?.size).toBe(500)

    // Temporary file was attempted to be cleaned up
    expect(client.tempFilesUnlinked.length).toBe(1)
    expect(client.tempFilesUnlinked[0]).toBe(client.tempFilesCreated[0])
  })

  it('should succeed when target file does not yet exist', async () => {
    const client = new MockRemoteSftpClient()
    const targetPath = '/var/data/newfile.txt'

    const result = await uploader.uploadWithAtomicOverwrite(client, localFile, targetPath)

    expect(result.success).toBe(true)
    expect(result.preservedMode).toBeUndefined()
    expect(client.chmodCalls.length).toBe(0)

    const finalStats = await client.lstat(targetPath)
    expect(finalStats.size).toBe(fs.statSync(localFile).size)
  })
})
