import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { CrossTransferClipboard } from '../src/cross-transfer/cross-transfer-clipboard'
import { CrossTransferRelayService } from '../src/cross-transfer/cross-transfer-relay.service'
import { TransferStore } from '../src/transfer-store/transfer-store'
import { RemoteSftpClient, RemoteFileStats } from '../src/sftp-plus/overwrite-uploader'

class MockTargetSftpClient implements RemoteSftpClient {
  files = new Map<string, { mode: number; size: number; isSymlink: boolean; isDir: boolean }>()

  async lstat(remotePath: string): Promise<RemoteFileStats> {
    const f = this.files.get(remotePath)
    if (!f) throw new Error('File not found')
    return {
      isSymbolicLink: () => f.isSymlink,
      isDirectory: () => f.isDir,
      mode: f.mode,
      size: f.size,
    }
  }

  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    const stats = fs.statSync(localPath)
    this.files.set(remotePath, {
      mode: 0o600,
      size: stats.size,
      isSymlink: false,
      isDir: false,
    })
  }

  async chmod(remotePath: string, mode: number): Promise<void> {
    const f = this.files.get(remotePath)
    if (f) f.mode = mode
  }

  async rename(oldRemotePath: string, newRemotePath: string): Promise<void> {
    const f = this.files.get(oldRemotePath)
    if (f) {
      this.files.delete(oldRemotePath)
      this.files.set(newRemotePath, f)
    }
  }

  async unlink(remotePath: string): Promise<void> {
    this.files.delete(remotePath)
  }
}

describe('Cross-Connection Transfer Relay (§4.1 #5)', () => {
  let clipboard: CrossTransferClipboard
  let relayService: CrossTransferRelayService
  let store: TransferStore
  let tempDir: string

  beforeEach(() => {
    clipboard = new CrossTransferClipboard()
    relayService = new CrossTransferRelayService(clipboard)
    store = new TransferStore()
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-transfer-test-'))
  })

  afterEach(() => {
    store.destroy()
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('should store and retrieve clipboard items across connection sessions', () => {
    clipboard.copy({
      sourceSessionId: 'sess-a',
      sourceSessionName: 'Host-A',
      remotePath: '/var/log/app.log',
      fileName: 'app.log',
      isDirectory: false,
      size: 1024,
      copiedAt: new Date(),
    })

    expect(clipboard.hasItem()).toBe(true)
    const item = clipboard.getItem()
    expect(item?.fileName).toBe('app.log')
    expect(item?.sourceSessionName).toBe('Host-A')

    clipboard.clear()
    expect(clipboard.hasItem()).toBe(false)
  })

  it('should successfully stage from source, upload to target, and clean up temp files', async () => {
    // Populate clipboard
    clipboard.copy({
      sourceSessionId: 'sess-a',
      sourceSessionName: 'Host-A',
      remotePath: '/home/user/document.txt',
      fileName: 'document.txt',
      isDirectory: false,
      size: 50,
      copiedAt: new Date(),
    })

    // Mock source client with downloadFile
    const mockSourceClient = {
      downloadFile: async (remotePath: string, localDest: string) => {
        fs.writeFileSync(localDest, 'Hello cross-connection payload!')
      },
    }

    const mockTargetClient = new MockTargetSftpClient()

    const result = await relayService.executeRemotePaste({
      sourceClient: mockSourceClient,
      targetClient: mockTargetClient,
      targetDirectory: '/opt/dest',
      targetStore: store,
      tempDir,
    })

    expect(result.targetPath).toBe('/opt/dest/document.txt')
    expect(mockTargetClient.files.has('/opt/dest/document.txt')).toBe(true)

    // Verify task in target store succeeded
    const task = store.tasks.find(t => t.id === result.taskId)
    expect(task?.status).toBe('succeeded')
    expect(task?.direction).toBe('cross-remote')

    // Verify local temp files in tempDir were cleaned up
    const remainingTempFiles = fs.readdirSync(tempDir)
    expect(remainingTempFiles.length).toBe(0)
  })

  it('should clean up local temp files if transfer fails', async () => {
    clipboard.copy({
      sourceSessionId: 'sess-a',
      sourceSessionName: 'Host-A',
      remotePath: '/bad/source.txt',
      fileName: 'source.txt',
      isDirectory: false,
      copiedAt: new Date(),
    })

    // Mock source client that throws error
    const mockSourceClient = {
      downloadFile: async (remotePath: string, localDest: string) => {
        fs.writeFileSync(localDest, 'partial')
        throw new Error('Remote host connection reset')
      },
    }

    const mockTargetClient = new MockTargetSftpClient()

    await expect(
      relayService.executeRemotePaste({
        sourceClient: mockSourceClient,
        targetClient: mockTargetClient,
        targetDirectory: '/opt/dest',
        targetStore: store,
        tempDir,
      })
    ).rejects.toThrow('Remote host connection reset')

    // Task marked as failed
    expect(store.tasks[0]?.status).toBe('failed')

    // Local temp file was removed
    const remainingTempFiles = fs.readdirSync(tempDir)
    expect(remainingTempFiles.length).toBe(0)
  })
})
