import * as fs from 'fs'
import { RemoteFileStats, RemoteSftpClient } from './overwrite-uploader'

function asStats(stat: any): RemoteFileStats {
  return {
    isSymbolicLink: () => {
      if (typeof stat?.isSymbolicLink === 'function') return !!stat.isSymbolicLink()
      return !!stat?.isSymbolicLink
    },
    isDirectory: () => {
      if (typeof stat?.isDirectory === 'function') return !!stat.isDirectory()
      return !!stat?.isDirectory
    },
    mode: typeof stat?.mode === 'number' ? stat.mode : 0,
    size: typeof stat?.size === 'number' ? stat.size : 0,
  }
}

/**
 * Adapts a Tabby/ssh2 SFTP session to the atomic uploader client.
 * uploadFile writes only the path it is given (the temporary file), never the final target.
 */
export function adaptSftpSession(sftp: any): RemoteSftpClient {
  return {
    async lstat(remotePath: string): Promise<RemoteFileStats> {
      const stat = sftp.lstat ? await sftp.lstat(remotePath) : await sftp.stat(remotePath)
      return asStats(stat)
    },
    async uploadFile(localPath: string, remotePath: string, onProgress?: (n: number) => void): Promise<void> {
      if (typeof sftp.uploadFile === 'function') {
        await sftp.uploadFile(localPath, remotePath, onProgress)
        return
      }
      const handle = await sftp.open(remotePath, 2 | 8 | 16)
      const fd = fs.openSync(localPath, 'r')
      try {
        const buf = Buffer.alloc(64 * 1024)
        let pos = 0
        let bytesRead = 0
        while ((bytesRead = fs.readSync(fd, buf, 0, buf.length, pos)) > 0) {
          await handle.write(buf.subarray(0, bytesRead))
          pos += bytesRead
          onProgress?.(pos)
        }
      } finally {
        fs.closeSync(fd)
        await handle.close()
      }
    },
    chmod(remotePath: string, mode: number): Promise<void> {
      return sftp.chmod(remotePath, mode)
    },
    rename(oldRemotePath: string, newRemotePath: string): Promise<void> {
      return sftp.rename(oldRemotePath, newRemotePath)
    },
    unlink(remotePath: string): Promise<void> {
      return sftp.unlink(remotePath)
    },
    async mkdir(remotePath: string): Promise<void> {
      if (typeof sftp.mkdir === 'function') await sftp.mkdir(remotePath)
    },
  }
}
