import { Injectable } from '@angular/core'
import * as path from 'path'
import * as crypto from 'crypto'
import * as fs from 'fs'

export interface RemoteFileStats {
  isSymbolicLink(): boolean
  isDirectory(): boolean
  mode: number
  size: number
}

export interface RemoteSftpClient {
  lstat(remotePath: string): Promise<RemoteFileStats>
  uploadFile(
    localPath: string,
    remotePath: string,
    onProgress?: (transferredBytes: number) => void
  ): Promise<void>
  chmod(remotePath: string, mode: number): Promise<void>
  rename(oldRemotePath: string, newRemotePath: string): Promise<void>
  unlink(remotePath: string): Promise<void>
}

export interface OverwriteUploadResult {
  success: boolean
  targetPath: string
  preservedMode?: number
  bytesUploaded: number
}

/**
 * OverwriteUploader implements the 6-step atomic overwrite upload algorithm defined in §4.2:
 * 1. lstat(target), refuse overwriting symbolic links. Target not existing -> don't save mode.
 * 2. Create random temporary file (0600) in target's directory.
 * 3. Upload to temporary file with optional size verification.
 * 4. If target originally existed, chmod(temporary, savedMode).
 * 5. Atomic rename(temporary, target).
 * 6. If any step fails: keep original target, attempt deleting temporary file, mark failed.
 */
@Injectable({ providedIn: 'root' })
export class OverwriteUploader {
  async uploadWithAtomicOverwrite(
    client: RemoteSftpClient,
    localSourcePath: string,
    remoteTargetPath: string,
    options: {
      onProgress?: (transferredBytes: number) => void
      verifySize?: boolean
    } = {}
  ): Promise<OverwriteUploadResult> {
    // Check local source file
    const localStats = fs.statSync(localSourcePath)
    const expectedSize = localStats.size

    // Step 1: lstat(target), refuse overwrite if it is a symbolic link
    let savedMode: number | null = null
    try {
      const remoteStats = await client.lstat(remoteTargetPath)
      if (remoteStats.isSymbolicLink()) {
        throw new Error(
          `Security violation: Refusing to overwrite symbolic link at ${remoteTargetPath}`
        )
      }
      if (remoteStats.isDirectory()) {
        throw new Error(
          `Cannot overwrite directory ${remoteTargetPath} with regular file`
        )
      }
      // Preserve permission bits (0777 or full posix bits 07777 including suid/sgid)
      savedMode = remoteStats.mode & 0o7777
    } catch (err: any) {
      if (err.message && err.message.includes('Security violation')) {
        throw err
      }
      if (err.message && err.message.includes('Cannot overwrite directory')) {
        throw err
      }
      // File does not exist, proceed without saved mode
      savedMode = null
    }

    // Step 2: Create random temporary file path in same directory
    const dir = path.posix.dirname(remoteTargetPath)
    const base = path.posix.basename(remoteTargetPath)
    const randomSuffix = crypto.randomBytes(6).toString('hex')
    const remoteTempPath = path.posix.join(dir, `.${base}.tmp.${randomSuffix}`)

    try {
      // Step 3: Upload to temporary file
      await client.uploadFile(localSourcePath, remoteTempPath, options.onProgress)

      if (options.verifySize) {
        const tempStats = await client.lstat(remoteTempPath)
        if (tempStats.size !== expectedSize) {
          throw new Error(
            `Upload integrity check failed: expected ${expectedSize} bytes, got ${tempStats.size} bytes`
          )
        }
      }

      // Step 4: If target originally existed, chmod(temporary, savedMode)
      if (savedMode !== null) {
        await client.chmod(remoteTempPath, savedMode)
      }

      // Step 5: Atomic rename(temporary, target)
      await client.rename(remoteTempPath, remoteTargetPath)

      return {
        success: true,
        targetPath: remoteTargetPath,
        preservedMode: savedMode ?? undefined,
        bytesUploaded: expectedSize,
      }
    } catch (error: any) {
      // Step 6: Rollback on any failure - keep original target intact, attempt removing temp file
      try {
        await client.unlink(remoteTempPath)
      } catch {
        // Ignore failure during temp unlink
      }
      throw error
    }
  }
}
