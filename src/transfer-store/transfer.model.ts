export type TransferStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export type TransferDirection = 'upload' | 'download' | 'cross-remote'

export interface TransferTask {
  id: string
  name: string
  sourcePath: string
  targetPath: string
  direction: TransferDirection
  totalBytes: number
  transferredBytes: number
  status: TransferStatus
  speedBytesPerSec: number
  error?: string
  startTime?: Date
  endTime?: Date
  cancelHandler?: () => void
  cleanupHandler?: () => void
}

export interface TransferSummary {
  queued: number
  running: number
  succeeded: number
  failed: number
  cancelled: number
  total: number
}
