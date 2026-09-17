export interface CrossTransferClipboardItem {
  sourceSessionId: string
  sourceSessionName: string
  sourceClientRef?: any
  remotePath: string
  fileName: string
  isDirectory: boolean
  size?: number
  copiedAt: Date
}
