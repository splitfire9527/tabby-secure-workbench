import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, HostBinding } from '@angular/core'
import { Subscription } from 'rxjs'
import { TransferStore } from '../transfer-store/transfer-store'
import { TransferTask, TransferSummary } from '../transfer-store/transfer.model'

@Component({
  selector: 'workbench-bottom-dock',
  template: `
    <div class="dock-header" (click)="toggleExpanded($event)">
      <div class="d-flex align-items-center">
        <span class="mr-2 icon-caret">
          <svg *ngIf="isExpanded" viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
            <polygon points="6 9 12 15 18 9"></polygon>
          </svg>
          <svg *ngIf="!isExpanded" viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
            <polygon points="6 15 12 9 18 15"></polygon>
          </svg>
        </span>
        <span class="font-weight-bold mr-3 text-light">Transfers</span>
        <span class="dock-summary text-muted">
          Running: <strong class="text-primary">{{ summary.running }}</strong> |
          Done: <strong class="text-success">{{ summary.succeeded }}</strong> |
          Failed: <strong class="text-danger">{{ summary.failed }}</strong>
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

      <div *ngFor="let task of tasks" class="transfer-row mb-2 p-2 rounded">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="font-weight-bold small text-truncate text-light" [title]="task.name">
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

        <div class="progress mb-1" style="height: 6px; background-color: #1e2227;">
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
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        width: 100%;
        background: #21252b;
        border-top: 1px solid #3e4451;
        flex-shrink: 0;
        box-sizing: border-box;
        overflow: hidden;
        user-select: none;
        transition: height 0.2s ease-in-out;
      }
      .dock-header {
        height: 28px;
        min-height: 28px;
        background: #282c34;
        padding: 0 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11px;
        cursor: pointer;
        border-bottom: 1px solid rgba(62, 68, 81, 0.5);
      }
      .icon-caret {
        display: inline-flex;
        align-items: center;
      }
      .dock-summary {
        font-family: monospace;
        font-size: 11px;
      }
      .dock-body {
        flex: 1;
        overflow-y: auto;
        padding: 8px 12px;
        min-height: 0;
      }
      .transfer-row {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.06);
      }
      .transfer-row:hover {
        background: rgba(255, 255, 255, 0.06);
      }
    `,
  ],
})
export class WorkbenchBottomDockComponent implements OnInit, OnDestroy {
  @Input() store!: TransferStore
  @Input() height = 140
  @Input() autoExpand = true
  @Input() isExpanded = false
  @Output() isExpandedChange = new EventEmitter<boolean>()

  tasks: TransferTask[] = []
  summary: TransferSummary = {
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0,
    total: 0,
  }

  @HostBinding('style.height.px')
  get hostHeight(): number {
    return this.isExpanded ? this.height : 28
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
      this.store.summary$.subscribe(summary => {
        this.summary = summary
        if (this.autoExpand && summary.running > 0 && !this.isExpanded) {
          this.isExpanded = true
          this.isExpandedChange.emit(true)
        }
      })
    )
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe())
  }

  toggleExpanded(event?: MouseEvent): void {
    if (event) event.stopPropagation()
    this.isExpanded = !this.isExpanded
    this.isExpandedChange.emit(this.isExpanded)
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
    if (!task.totalBytes || task.totalBytes <= 0) return 0
    return Math.min(100, Math.round((task.transferredBytes / task.totalBytes) * 100))
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }
}
