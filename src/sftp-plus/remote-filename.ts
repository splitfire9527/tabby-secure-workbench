import * as iconv from 'iconv-lite'
import { WorkbenchEncoding } from '../config/config.model'

export function remoteEncodingName(encoding: WorkbenchEncoding): string {
  switch (encoding) {
    case 'UTF-8':
      return 'utf-8'
    case 'GBK':
      return 'gbk'
    case 'GB2312':
      return 'gb2312'
    case 'GB18030':
      return 'gb18030'
    case 'BIG5':
      return 'big5'
    default:
      return 'utf-8'
  }
}

function isByteString(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 255) return false
  }
  return true
}

/** Show a remote file name in the selected encoding. Unicode names are left as-is. */
export function decodeRemoteText(value: string, encoding: WorkbenchEncoding): string {
  if (!value || encoding === 'UTF-8' || !isByteString(value)) return value
  try {
    const decoded = iconv.decode(Buffer.from(value, 'latin1'), remoteEncodingName(encoding))
    if (!decoded || decoded.includes('\uFFFD')) return value
    return decoded
  } catch {
    return value
  }
}

export function decodeRemotePath(remotePath: string, encoding: WorkbenchEncoding): string {
  if (!remotePath || encoding === 'UTF-8') return remotePath
  return remotePath
    .split('/')
    .map(part => (part ? decodeRemoteText(part, encoding) : part))
    .join('/')
}

/** Turn a typed Unicode path into the raw remote bytes, kept as a latin1 string. */
export function encodeRemoteText(value: string, encoding: WorkbenchEncoding): string {
  if (!value || encoding === 'UTF-8' || isByteString(value)) return value
  try {
    return iconv.encode(value, remoteEncodingName(encoding)).toString('latin1')
  } catch {
    return value
  }
}

export function encodeRemotePath(remotePath: string, encoding: WorkbenchEncoding): string {
  if (!remotePath || encoding === 'UTF-8' || isByteString(remotePath)) return remotePath
  return remotePath
    .split('/')
    .map(part => (part ? encodeRemoteText(part, encoding) : part))
    .join('/')
}
