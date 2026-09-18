import { BehaviorSubject, Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { TransferTask, TransferStatus, TransferSummary } from './transfer.model'

/**
 * TransferStore manages the lifecycle of SFTP transfers for a specific Tab.
 * Each tab owns an isolated instance that is destroyed when the tab closes.
 */
export class TransferStore {
  private tasksSubject = new BehaviorSubject<TransferTask[]>([])
  readonly tasks$: Observable<TransferTask[]> = this.tasksSubject.asObservable()

  readonly summary$: Observable<TransferSummary> = this.tasks$.pipe(
    map(tasks => {
      let queued = 0
      let running = 0
      let succeeded = 0
      let failed = 0
      let cancelled = 0

      for (const t of tasks) {
        if (t.status === 'queued') queued++
        else if (t.status === 'running') running++
        else if (t.status === 'succeeded') succeeded++
        else if (t.status === 'failed') failed++
        else if (t.status === 'cancelled') cancelled++
      }

      return {
        queued,
        running,
        succeeded,
        failed,
        cancelled,
        total: tasks.length,
      }
    })
  )

  get tasks(): TransferTask[] {
    return this.tasksSubject.value
  }

  getTasks(): TransferTask[] {
    return this.tasksSubject.value
  }

  getSummary(): TransferSummary {
    let queued = 0
    let running = 0
    let succeeded = 0
    let failed = 0
    let cancelled = 0

    for (const t of this.tasksSubject.value) {
      if (t.status === 'queued') queued++
      else if (t.status === 'running') running++
      else if (t.status === 'succeeded') succeeded++
      else if (t.status === 'failed') failed++
      else if (t.status === 'cancelled') cancelled++
    }

    return {
      queued,
      running,
      succeeded,
      failed,
      cancelled,
      total: this.tasksSubject.value.length,
    }
  }

  addTask(
    taskInit: Omit<TransferTask, 'status' | 'transferredBytes' | 'speedBytesPerSec'> & {
      status?: TransferStatus
    }
  ): TransferTask {
    const task: TransferTask = {
      ...taskInit,
      status: taskInit.status || 'queued',
      transferredBytes: 0,
      speedBytesPerSec: 0,
      startTime: new Date(),
    }

    const current = this.tasksSubject.value
    this.tasksSubject.next([...current, task])
    return task
  }

  updateTaskStatus(id: string, status: TransferStatus, error?: string): void {
    const current = this.tasksSubject.value
    const idx = current.findIndex(t => t.id === id)
    if (idx === -1) return

    const updated = [...current]
    const task = { ...updated[idx], status }
    if (error) task.error = error
    if (status === 'succeeded' || status === 'failed' || status === 'cancelled') {
      task.endTime = new Date()
      task.speedBytesPerSec = 0
      if (status === 'cancelled') {
        try {
          task.cancelHandler?.()
        } catch {}
      }
      try {
        task.cleanupHandler?.()
      } catch {}
    }

    updated[idx] = task
    this.tasksSubject.next(updated)
  }

  updateProgress(id: string, transferredBytes: number, speedBytesPerSec = 0): void {
    const current = this.tasksSubject.value
    const idx = current.findIndex(t => t.id === id)
    if (idx === -1) return

    const updated = [...current]
    const task = updated[idx]
    if (task.status === 'queued') {
      task.status = 'running'
    }
    task.transferredBytes = transferredBytes
    task.speedBytesPerSec = speedBytesPerSec

    updated[idx] = { ...task }
    this.tasksSubject.next(updated)
  }

  cancelTask(id: string): void {
    this.updateTaskStatus(id, 'cancelled')
  }

  cancelAll(): void {
    const current = this.tasksSubject.value
    for (const t of current) {
      if (t.status === 'running' || t.status === 'queued') {
        this.updateTaskStatus(t.id, 'cancelled')
      }
    }
  }

  clearCompleted(): void {
    const current = this.tasksSubject.value
    this.tasksSubject.next(
      current.filter(t => t.status === 'running' || t.status === 'queued')
    )
  }

  /**
   * Cleans up the store when the owning Tab is closed.
   * Immediately cancels any pending or active transfers and triggers temp cleanups.
   */
  destroy(): void {
    this.cancelAll()
    this.tasksSubject.complete()
  }
}
