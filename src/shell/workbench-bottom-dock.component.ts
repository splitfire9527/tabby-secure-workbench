import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  HostBinding,
  Optional,
  ChangeDetectorRef,
} from '@angular/core'
import { Subscription } from 'rxjs'
import { ConfigService } from 'tabby-core'
import { TransferStore } from '../transfer-store/transfer-store'
import { TransferTask, TransferSummary } from '../transfer-store/transfer.model'

@Component({
  selector: 'workbench-bottom-dock',
  template: `
    <!-- Top Resizer Handle for smooth height dragging -->
    <div
      *ngIf="isExpanded"
      class="dock-resizer"
      (mousedown)="onResizeStart($event)"
      title="拖动调整传输队列高度"
    ></div>

    <div class="dock-header">
      <div class="d-flex align-items-center gap-2">
        <span class="font-weight-bold d-flex align-items-center dock-title" style="font-size: 11px;">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" class="mr-1">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
          传输任务队列 (全局)
        </span>
        <span class="text-muted small">|</span>
        <span class="dock-summary text-muted" style="font-size: 11px;">
          <span class="text-info mr-2">传输中: <strong>{{ summary.running }}</strong></span>
          <span class="text-success mr-2">已完成: <strong>{{ summary.succeeded }}</strong></span>
          <span class="text-danger" *ngIf="summary.failed > 0">失败: <strong>{{ summary.failed }}</strong></span>
        </span>
      </div>

      <div class="d-flex align-items-center gap-2">
        <button
          *ngIf="summary.running > 0"
          class="btn btn-xs btn-outline-danger py-0 px-2"
          style="font-size: 10px;"
          (click)="cancelAll()"
          title="取消所有进行中任务"
        >
          全部取消
        </button>
        <button
          *ngIf="summary.succeeded > 0 || summary.failed > 0 || summary.cancelled > 0"
          class="btn btn-xs btn-outline-secondary py-0 px-2 text-muted"
          style="font-size: 10px;"
          (click)="clearCompleted()"
          title="清空已完成记录"
        >
          清空已完成
        </button>
        <button
          class="btn btn-xs btn-link text-muted p-0 ml-2"
          data-action="collapse-dock"
          (click)="toggleExpanded($event)"
          title="收起抽屉"
          style="line-height: 1;"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      </div>
    </div>

    <!-- Compact Task List (Reverse Order, Newest on Top, ~32px item height) -->
    <div *ngIf="isExpanded" class="dock-body">
      <div *ngIf="tasks.length === 0" class="text-muted small text-center p-2">
        暂无传输任务记录
      </div>

      <div *ngFor="let task of tasks" class="transfer-row mb-1 px-2 py-1 rounded">
        <!-- Main Line: Compact ~22px height -->
        <div class="d-flex align-items-center justify-content-between">
          <div class="d-flex align-items-center gap-1 text-truncate mr-2 flex-1" style="min-width: 0;">
            <!-- Direction Icon -->
            <span
              class="direction-icon mr-1"
              [class.upload]="task.direction === 'upload'"
              [class.download]="task.direction !== 'upload'"
              [title]="task.direction === 'upload' ? '上传' : '下载'"
            >
              {{ task.direction === 'upload' ? '⬆' : '⬇' }}
            </span>
            <!-- Task Name -->
            <span class="font-weight-bold task-name text-truncate" style="max-width: 140px; font-size: 11px;" [title]="task.name">
              {{ task.name }}
            </span>
            <!-- Status Badge -->
            <span
              class="badge badge-sm mr-2"
              [ngClass]="{
                'badge-primary': task.status === 'running',
                'badge-secondary': task.status === 'queued',
                'badge-success': task.status === 'succeeded',
                'badge-danger': task.status === 'failed',
                'badge-warning': task.status === 'cancelled'
              }"
              style="font-size: 10px; padding: 1px 4px;"
            >
              {{ getStatusLabel(task.status) }}
            </span>
            <!-- Path details -->
            <span class="text-truncate text-muted task-paths" style="font-size: 11px;" [title]="task.sourcePath + ' -> ' + task.targetPath">
              {{ task.sourcePath }} &rarr; {{ task.targetPath }}
            </span>
          </div>

          <!-- Right side: Bytes, Percent, Cancel button -->
          <div class="d-flex align-items-center gap-2 flex-shrink-0">
            <span class="task-bytes font-mono text-muted" style="font-size: 10px;">
              {{ formatBytes(task.transferredBytes) }} / {{ formatBytes(task.totalBytes) }}
            </span>
            <span class="task-percent font-mono font-weight-bold text-muted" style="font-size: 10px; width: 34px; text-align: right;">
              {{ getProgressPercent(task) }}%
            </span>
            <button
              *ngIf="task.status === 'running' || task.status === 'queued'"
              class="btn btn-xs btn-outline-danger py-0 px-1 btn-cancel-task"
              style="font-size: 10px; line-height: 1;"
              (click)="cancelTask(task.id)"
              title="取消任务"
            >
              &times;
            </button>
          </div>
        </div>

        <!-- Slim 2px Progress Bar at bottom of row -->
        <div class="progress task-progress-track mt-1" style="height: 2px; border-radius: 1px; margin-bottom: 0;">
          <div
            class="progress-bar"
            [style.width.%]="getProgressPercent(task)"
            [ngClass]="{
              'bg-primary': task.status === 'running',
              'bg-success': task.status === 'succeeded',
              'bg-danger': task.status === 'failed',
              'bg-warning': task.status === 'cancelled'
            }"
          ></div>
        </div>

        <div *ngIf="task.error" class="text-danger small font-mono mt-1" style="font-size: 10px;">
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
        background: #f0f2f5;
        border-top: 1px solid #d0d4dc;
        flex-shrink: 0;
        box-sizing: border-box;
        overflow: hidden;
        user-select: none;
        position: relative;
        z-index: 30;
      }
      .dock-resizer {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 5px;
        cursor: ns-resize;
        z-index: 50;
        background: transparent;
        transition: background 0.15s ease;
      }
      .dock-resizer:hover {
        background: #1e70bf;
      }
      .dock-header {
        height: 28px;
        min-height: 28px;
        background: #f0f2f5;
        padding: 0 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11px;
        border-bottom: 1px solid #d0d4dc;
        color: #1e293b;
      }
      .dock-title {
        color: #1e70bf;
      }
      .dock-summary {
        font-family: inherit;
        font-size: 11px;
      }
      .dock-body {
        flex: 1;
        overflow-y: auto;
        padding: 6px 10px;
        min-height: 0;
        background: #ffffff;
      }
      .transfer-row {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        transition: background 0.1s ease;
      }
      .transfer-row:hover {
        background: #f1f5f9;
      }
      .direction-icon {
        font-size: 11px;
        font-weight: bold;
      }
      .direction-icon.upload {
        color: #1e70bf;
      }
      .direction-icon.download {
        color: #166534;
      }
      .task-name {
        color: #1e293b;
      }
      .task-progress-track {
        background-color: #e2e8f0;
      }
      .task-paths,
      .task-bytes {
        color: #64748b;
      }
      .btn-cancel-task {
        padding: 0 4px;
      }
      svg {
        width: 14px !important;
        height: 14px !important;
        max-width: 14px !important;
        max-height: 14px !important;
        flex-shrink: 0 !important;
        display: inline-block !important;
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

  @HostBinding('style.display')
  get hostDisplay(): string {
    return this.isExpanded ? 'flex' : 'none'
  }

  @HostBinding('style.height.px')
  get hostHeight(): number {
    return this.isExpanded ? this.height : 0
  }

  private subs: Subscription[] = []

  constructor(
    public cdr: ChangeDetectorRef,
    @Optional() private config?: ConfigService
  ) {}

  ngOnInit(): void {
    if (this.config?.store?.secureWorkbench?.transferQueueHeight) {
      this.height = this.config.store.secureWorkbench.transferQueueHeight
    }
    if (this.store) this.bindStore(this.store)
  }

  /**
   * Rebind the dock to another tab's queue. Previous tasks disappear from this dock.
   */
  bindStore(store: TransferStore | null): void {
    this.subs.forEach(s => s.unsubscribe())
    this.subs = []
    this.store = store as TransferStore
    this.tasks = []
    this.summary = { queued: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0, total: 0 }
    if (!store) {
      try { this.cdr.detectChanges() } catch {}
      return
    }
    this.subs.push(
      store.tasks$.subscribe((tasks) => {
        this.tasks = [...tasks].reverse()
        try { this.cdr.detectChanges() } catch {}
      })
    )
    this.subs.push(
      store.summary$.subscribe((summary) => {
        this.summary = summary
        if (this.autoExpand && summary.running > 0 && !this.isExpanded) {
          this.isExpanded = true
          this.isExpandedChange.emit(true)
        }
        try { this.cdr.detectChanges() } catch {}
      })
    )
  }

  private activeResizeCleanup: (() => void) | null = null

  ngOnDestroy(): void {
    if (this.activeResizeCleanup) {
      this.activeResizeCleanup()
    }
    this.subs.forEach((s) => s.unsubscribe())
    this.subs = []
  }

  toggleExpanded(event?: MouseEvent): void {
    if (event) event.stopPropagation()
    this.isExpanded = !this.isExpanded
    this.isExpandedChange.emit(this.isExpanded)
    try {
      this.cdr.detectChanges()
    } catch {}
  }

  onResizeStart(event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    const startY = event.clientY
    const startHeight = this.height

    const cleanup = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      this.activeResizeCleanup = null
    }

    const onMouseMove = (e: MouseEvent) => {
      const delta = startY - e.clientY
      const newHeight = Math.max(80, Math.min(600, startHeight + delta))
      this.height = newHeight
      try {
        this.cdr.detectChanges()
      } catch {}
    }

    const onMouseUp = () => {
      cleanup()
      if (this.config) {
        if (!this.config.store.secureWorkbench) {
          this.config.store.secureWorkbench = {}
        }
        this.config.store.secureWorkbench.transferQueueHeight = this.height
        this.config.save()
      }
    }

    this.activeResizeCleanup = cleanup
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
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
    if (!bytes || bytes <= 0 || isNaN(bytes)) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i] || 'B'}`
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'running':
        return '传输中'
      case 'queued':
        return '排队中'
      case 'succeeded':
        return '已完成'
      case 'failed':
        return '失败'
      case 'cancelled':
        return '已取消'
      default:
        return status
    }
  }
}
