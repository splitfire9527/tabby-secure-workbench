import { Component, Input, OnInit, OnDestroy } from '@angular/core'
import { Subscription } from 'rxjs'
import { TransferStore } from '../transfer-store/transfer-store'
import { TransferTask, TransferSummary } from '../transfer-store/transfer.model'

@Component({
  selector: 'workbench-bottom-dock',
  template: `
    <div
      class="workbench-bottom-dock"
      [style.height.px]="isExpanded ? height : 28"
    >
      <div class="dock-header" (click)="toggleExpanded($event)">
        <div class="d-flex align-items-center">
          <span class="mr-2">{{ isExpanded ? '▼' : '▲' }}</span>
          <span class="font-weight-bold mr-3">Transfers</span>
          <span class="dock-summary text-muted">
            ⚡ Running: {{ summary.running }} | Done: {{ summary.succeeded }} | Failed: {{ summary.failed }}
          </span>
        </div>

        <div class="d-flex align-items-center" (click)="$event.stopPropagation()">
          <button
            *ngIf="summary.running > 0"
            class="btn btn-xs btn-outline-danger py-0 px-2 mr-2"
            style="font-size: 11px;"
            (click)="cancelAll()"
          >
            Cancel All
          </button>
          <button
            *ngIf="summary.succeeded > 0 || summary.failed > 0 || summary.cancelled > 0"
            class="btn btn-xs btn-outline-secondary py-0 px-2"
            style="font-size: 11px;"
            (click)="clearCompleted()"
          >
            Clear Completed
          </button>
        </div>
      </div>

      <div *ngIf="isExpanded" class="dock-body">
        <div *ngIf="tasks.length === 0" class="text-muted small text-center p-3">
          No transfers in this session.
        </div>

        <div *ngFor="let task of tasks" class="transfer-row mb-2 p-2 rounded border">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="font-weight-bold small text-truncate" [title]="task.name">
              {{ task.name }}
            </span>
            <span
              class="badge badge-sm"
              [ngClass]="{
                'badge-primary': task.status === 'running',
                'badge-secondary': task.status === 'queued',
                'badge-success': task.status === 'succeeded',
                'badge-danger': task.status === 'failed',
                'badge-warning': task.status === 'cancelled'
              }"
            >
              {{ task.status }}
            </span>
          </div>

          <div class="progress mb-1" style="height: 6px;">
            <div
              class="progress-bar"
              [style.width.%]="getProgressPercent(task)"
              [ngClass]="{
                'bg-success': task.status === 'succeeded',
                'bg-danger': task.status === 'failed',
                'bg-warning': task.status === 'cancelled'
              }"
            ></div>
          </div>

          <div class="d-flex justify-content-between align-items-center small text-muted" style="font-size: 11px;">
            <span class="text-truncate mr-2" [title]="task.sourcePath + ' -> ' + task.targetPath">
              {{ task.sourcePath }} &rarr; {{ task.targetPath }}
            </span>
            <div class="d-flex align-items-center">
              <span class="mr-3">
                {{ formatBytes(task.transferredBytes) }} / {{ formatBytes(task.totalBytes) }}
              </span>
              <button
                *ngIf="task.status === 'running' || task.status === 'queued'"
                class="btn btn-xs btn-outline-danger py-0 px-1"
                style="font-size: 10px;"
                (click)="cancelTask(task.id)"
              >
                Cancel
              </button>
            </div>
          </div>

          <div *ngIf="task.error" class="text-danger small mt-1" style="font-size: 11px;">
            Error: {{ task.error }}
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .transfer-row {
        background: rgba(255, 255, 255, 0.02);
      }
      .transfer-row:hover {
        background: rgba(255, 255, 255, 0.05);
      }
    `,
  ],
})
export class WorkbenchBottomDockComponent implements OnInit, OnDestroy {
  @Input() store!: TransferStore
  @Input() height = 140
  @Input() autoExpand = true

  isExpanded = false
  tasks: TransferTask[] = []
  summary: TransferSummary = {
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0,
    total: 0,
  }

  private subs: Subscription[] = []

  ngOnInit(): void {
    if (!this.store) return

    this.subs.push(
      this.store.tasks$.subscribe(tasks => {
        this.tasks = tasks
      })
    )

    this.subs.push(
      this.store.summary$.subscribe(sum => {
        this.summary = sum
        if (this.autoExpand && sum.running > 0 && !this.isExpanded) {
          this.isExpanded = true
        }
      })
    )
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe())
  }

  toggleExpanded(ev?: MouseEvent): void {
    if (ev) ev.stopPropagation()
    this.isExpanded = !this.isExpanded
  }

  cancelTask(id: string): void {
    this.store.cancelTask(id)
  }

  cancelAll(): void {
    this.store.cancelAll()
  }

  clearCompleted(): void {
    this.store.clearCompleted()
  }

  getProgressPercent(task: TransferTask): number {
    if (task.totalBytes <= 0) {
      return task.status === 'succeeded' ? 100 : 0
    }
    return Math.min(100, Math.floor((task.transferredBytes / task.totalBytes) * 100))
  }

  formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
  }
}
