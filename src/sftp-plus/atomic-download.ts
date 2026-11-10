import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

/** Keep the destination intact until the complete download has been closed. */
export async function atomicDownload(
  sftp: any, source: string, destination: string,
  assertActive: () => void = () => {},
  onProgress: (bytes: number) => void = () => {},
): Promise<void> {
  const temp = path.join(path.dirname(destination), `.${path.basename(destination)}.${crypto.randomBytes(12).toString('hex')}.tmp`)
  let handle: any
  let fd: number | undefined
  try {
    assertActive()
    fd = fs.openSync(temp, 'wx', 0o600)
    handle = await sftp.open(source, 1)
    let bytes = 0
    while (true) {
      assertActive()
      const chunk = await handle.read()
      assertActive()
      if (!chunk?.length) break
      const data = Buffer.from(chunk)
      let offset = 0
      while (offset < data.length) offset += fs.writeSync(fd, data, offset, data.length - offset)
      bytes += data.length
      onProgress(bytes)
    }
    await handle.close()
    handle = null
    fs.fsyncSync(fd)
    fs.closeSync(fd)
    fd = undefined
    assertActive()
    // Never follow a destination symlink or overwrite a directory.
    try {
      const stat = fs.lstatSync(destination)
      if (!stat.isFile()) throw new Error('Destination is not a regular file')
      fs.chmodSync(temp, stat.mode & 0o777)
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw error
    }
    fs.renameSync(temp, destination)
  } finally {
    try { if (fd !== undefined) fs.closeSync(fd) } finally {
      try { if (handle) await handle.close() } finally {
        try { fs.unlinkSync(temp) } catch (error: any) { if (error.code !== 'ENOENT') throw error }
      }
    }
  }
}
