import { Injectable } from '@angular/core'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import * as crypto from 'crypto'
import { CrossTransferClipboard } from './cross-transfer-clipboard'
import { TransferStore } from '../transfer-store/transfer-store'
import { OverwriteUploader, RemoteSftpClient } from '../sftp-plus/overwrite-uploader'

export interface RelayOptions {
  sourceClient: any // SFTP client with fastGet or stream read
  targetClient: RemoteSftpClient
  targetDirectory: string
  targetStore: TransferStore
  tempDir?: string
}

export interface RelayExecutionResult {
  taskId: string
  sourcePath: string
  targetPath: string
  bytesTransferred: number
}

@Injectable({ providedIn: 'root' })
export class CrossTransferRelayService {
  constructor(
    private clipboard: CrossTransferClipboard,
    private uploader: OverwriteUploader = new OverwriteUploader()
  ) {}

  /**
   * Executes a cross-connection remote paste operation:
   * 1. Pulls the item from clipboard.
   * 2. Stages source remote file into local temp file.
   * 3. Uploads local temp file to target remote via OverwriteUploader.
   * 4. Cleans up temp file on completion, failure, or cancellation.
   */
  async executeRemotePaste(options: RelayOptions): Promise<RelayExecutionResult> {
    const item = this.clipboard.getItem()
    if (!item) {
      throw new Error('Clipboard is empty. Please copy a remote file first.')
    }
    if (!options.sourceClient || options.sourceClient.closed) {
      throw new Error('Source connection is disconnected')
    }

    const { sourceClient, targetClient, targetDirectory, targetStore } = options
    const targetPath = path.posix.join(targetDirectory, item.fileName)
    const taskId = `relay-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`

    // Stage file path in local OS temp directory
    const baseTempDir = options.tempDir || os.tmpdir()
    const tempFileName = `workbench-relay-${crypto.randomBytes(8).toString('hex')}${item.isDirectory ? '' : '.tmp'}`
    const localTempPath = path.join(baseTempDir, tempFileName)

    let isCancelled = false
    const cleanupTempFile = () => {
      try {
        if (!fs.existsSync(localTempPath)) return
        const st = fs.statSync(localTempPath)
        if (st.isDirectory()) fs.rmSync(localTempPath, { recursive: true, force: true })
        else fs.unlinkSync(localTempPath)
      } catch {}
    }

    targetStore.addTask({
      id: taskId,
      name: `Cross-Copy: ${item.fileName}`,
      sourcePath: `${item.sourceSessionName}:${item.remotePath}`,
      targetPath,
      direction: 'cross-remote',
      totalBytes: item.size || 0,
      cancelHandler: () => {
        isCancelled = true
        cleanupTempFile()
      },
      cleanupHandler: cleanupTempFile,
    })

    try {
      targetStore.updateTaskStatus(taskId, 'running')
      this.assertSourceOpen(sourceClient)

      let bytesTransferred = 0
      if (item.isDirectory) {
        fs.mkdirSync(localTempPath, { recursive: true, mode: 0o700 })
        await this.stageDirectory(sourceClient, item.remotePath, localTempPath)
        if (isCancelled || sourceClient.closed) throw new Error(isCancelled ? 'Transfer cancelled by user' : 'Source connection is disconnected')
        bytesTransferred = await this.uploadStagedDirectory(targetClient, localTempPath, targetPath)
      } else {
        await this.stageFromSource(sourceClient, item.remotePath, localTempPath, bytes => {
          if (isCancelled) throw new Error('Transfer cancelled by user')
          if (sourceClient.closed) throw new Error('Source connection is disconnected')
          const total = item.size || bytes
          targetStore.updateProgress(taskId, Math.floor(bytes * 0.5))
        })
        if (isCancelled || sourceClient.closed) {
          throw new Error(isCancelled ? 'Transfer cancelled by user' : 'Source connection is disconnected')
        }
        const fileSize = fs.statSync(localTempPath).size
        await this.uploader.uploadWithAtomicOverwrite(targetClient, localTempPath, targetPath, {
          onProgress: bytes => {
            if (isCancelled) throw new Error('Transfer cancelled by user')
            targetStore.updateProgress(taskId, Math.floor(fileSize * 0.5 + bytes * 0.5))
          },
        })
        bytesTransferred = fileSize
      }

      targetStore.updateProgress(taskId, bytesTransferred)
      targetStore.updateTaskStatus(taskId, 'succeeded')

      return {
        taskId,
        sourcePath: item.remotePath,
        targetPath,
        bytesTransferred,
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Cross-connection transfer failed'
      if (isCancelled) {
        targetStore.updateTaskStatus(taskId, 'cancelled')
      } else {
        targetStore.updateTaskStatus(taskId, 'failed', errorMsg)
      }
      throw err
    } finally {
      cleanupTempFile()
    }
  }

  /**
   * Helper to download remote file to local staging file.
   * Supports standard ssh2/sftp client methods or custom stream.
   */
  private assertSourceOpen(client: any): void {
    if (!client || client.closed) throw new Error('Source connection is disconnected')
  }

  private async stageDirectory(client: any, remotePath: string, localDir: string): Promise<void> {
    this.assertSourceOpen(client)
    fs.mkdirSync(localDir, { recursive: true, mode: 0o700 })
    const entries = await this.listRemote(client, remotePath)
    for (const entry of entries) {
      if (entry.name === '.' || entry.name === '..') continue
      this.assertSourceOpen(client)
      const remoteChild = path.posix.join(remotePath, entry.name)
      const localChild = path.join(localDir, entry.name)
      if (entry.isDirectory) await this.stageDirectory(client, remoteChild, localChild)
      else await this.stageFromSource(client, remoteChild, localChild)
    }
  }

  private async listRemote(client: any, remotePath: string): Promise<{ name: string; isDirectory: boolean }[]> {
    if (typeof client.readdir !== 'function') {
      throw new Error('Source client cannot list directories')
    }
    const entries = await client.readdir(remotePath)
    return (entries || []).map((entry: any) => {
      const name = entry.filename || entry.name
      const isDirectory =
        typeof entry.isDirectory === 'function'
          ? entry.isDirectory()
          : !!entry.isDirectory ||
            (entry.attrs
              ? typeof entry.attrs.isDirectory === 'function'
                ? entry.attrs.isDirectory()
                : !!entry.attrs.isDirectory
              : false)
      return { name, isDirectory }
    })
  }

  private async uploadStagedDirectory(
    client: RemoteSftpClient,
    localDir: string,
    remoteDir: string
  ): Promise<number> {
    if (typeof client.mkdir === 'function') {
      try {
        await client.mkdir(remoteDir)
      } catch {
        // The directory may already exist.
      }
    }
    let bytes = 0
    for (const entry of fs.readdirSync(localDir, { withFileTypes: true })) {
      const localChild = path.join(localDir, entry.name)
      const remoteChild = path.posix.join(remoteDir, entry.name)
      if (entry.isDirectory()) {
        bytes += await this.uploadStagedDirectory(client, localChild, remoteChild)
      } else {
        const result = await this.uploader.uploadWithAtomicOverwrite(client, localChild, remoteChild)
        bytes += result.bytesUploaded
      }
    }
    return bytes
  }

  private async stageFromSource(
    client: any,
    remotePath: string,
    localTempPath: string,
    onProgress?: (bytes: number) => void
  ): Promise<void> {
    this.assertSourceOpen(client)

    if (typeof client.downloadFile === 'function') {
      return client.downloadFile(remotePath, localTempPath, onProgress)
    }

    if (typeof client.fastGet === 'function') {
      return new Promise<void>((resolve, reject) => {
        client.fastGet(
          remotePath,
          localTempPath,
          {
            step: (totalTransferred: number) => {
              onProgress?.(totalTransferred)
            },
          },
          (err: any) => {
            if (err) reject(err)
            else resolve()
          }
        )
      })
    }

    // Stream fallback
    return new Promise<void>((resolve, reject) => {
      try {
        const readStream = client.createReadStream
          ? client.createReadStream(remotePath)
          : null

        if (!readStream) {
          throw new Error('Source client does not support file streaming')
        }

        const writeStream = fs.createWriteStream(localTempPath, { mode: 0o600 })
        let transferred = 0

        readStream.on('data', (chunk: Buffer) => {
          transferred += chunk.length
          onProgress?.(transferred)
        })

        readStream.on('error', (err: any) => {
          writeStream.destroy()
          reject(err)
        })

        writeStream.on('error', (err: any) => {
          readStream.destroy()
          reject(err)
        })

        writeStream.on('finish', () => resolve())
        readStream.pipe(writeStream)
      } catch (err) {
        reject(err)
      }
    })
  }
}
