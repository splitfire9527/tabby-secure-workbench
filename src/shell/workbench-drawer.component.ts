import { Component, Input, Output, EventEmitter } from '@angular/core'
import { ConfigService, NotificationsService } from 'tabby-core'
import { ActivityTab } from './workbench-activity-bar.component'
import { DirectoryPair } from '../sftp-plus/directory-pair.model'
import { DEFAULT_WORKBENCH_CONFIG } from '../config/config.model'

@Component({
  selector: 'workbench-drawer',
  template: `
    <div class="workbench-drawer">
      <!-- Header -->
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h6 class="font-weight-bold text-uppercase m-0 text-white" style="font-size: 12px; letter-spacing: 0.5px;">
          {{ title }}
        </h6>
        <button class="btn btn-xs btn-link text-muted p-0" (click)="closeDrawer.emit()" title="Hide Drawer">
          &times;
        </button>
      </div>

      <!-- Commands Drawer -->
      <div *ngIf="activeTab === 'commands'" class="flex-grow-1" style="overflow: hidden;">
        <workbench-command-library [activeTerminalTab]="activeTerminalTab"></workbench-command-library>
      </div>

      <!-- Sessions Drawer -->
      <div *ngIf="activeTab === 'sessions'" class="flex-grow-1" style="overflow-y: auto;">
        <div class="mb-2">
          <input
            type="text"
            class="form-control form-control-sm"
            placeholder="Search sessions (Alt+C)..."
            [(ngModel)]="sessionFilter"
          />
        </div>
        <div class="session-list">
          <div
            *ngFor="let s of filteredSessions"
            class="session-item p-2 mb-1 rounded border d-flex justify-content-between align-items-center"
            (click)="selectSession.emit(s)"
            style="cursor: pointer;"
          >
            <div class="text-truncate">
              <div class="font-weight-bold small text-truncate">{{ s.title || s.name || 'SSH Session' }}</div>
              <div class="text-muted small" style="font-size: 11px;">
                {{ s.profile?.options?.user || 'user' }}@{{ s.profile?.options?.host || 'localhost' }}
              </div>
            </div>
            <span class="badge badge-success badge-sm">&#x25cf;</span>
          </div>
          <div *ngIf="filteredSessions.length === 0" class="text-muted small text-center p-3">
            No active SSH sessions found.
          </div>
        </div>
      </div>

      <!-- Directory Pairs Drawer -->
      <div *ngIf="activeTab === 'pairs'" class="flex-grow-1" style="overflow-y: auto;">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <span class="small text-muted">{{ directoryPairs.length }} pair(s)</span>
          <button class="btn btn-xs btn-outline-primary" (click)="showNewPairModal = true">
            + New Pair
          </button>
        </div>

        <div *ngFor="let p of directoryPairs" class="pair-item p-2 mb-2 rounded border">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="font-weight-bold small text-truncate" [title]="p.title">{{ p.title }}</span>
            <button class="btn btn-xs btn-outline-danger py-0 px-1" (click)="deletePair(p.id)">&times;</button>
          </div>
          <div class="small text-muted text-truncate mb-1" style="font-size: 11px;">
            💻 Local: <code>{{ p.localPath || '(not set)' }}</code>
          </div>
          <div class="small text-muted text-truncate mb-2" style="font-size: 11px;">
            📁 Remote: <code>{{ p.remotePath || '(not set)' }}</code>
          </div>
          <button class="btn btn-xs btn-block btn-outline-secondary" (click)="applyDirectoryPair.emit(p)">
            Jump to Paths
          </button>
        </div>

        <!-- Add Pair Modal -->
        <div *ngIf="showNewPairModal" class="card p-3 mt-2 shadow border-primary">
          <h6 class="small font-weight-bold mb-2">Add Directory Pair</h6>
          <div class="form-group mb-2">
            <label class="small">Title</label>
            <input type="text" class="form-control form-control-sm" [(ngModel)]="newPair.title" />
          </div>
          <div class="form-group mb-2">
            <label class="small">Local Path</label>
            <input type="text" class="form-control form-control-sm" [(ngModel)]="newPair.localPath" />
          </div>
          <div class="form-group mb-2">
            <label class="small">Remote Path</label>
            <input type="text" class="form-control form-control-sm" [(ngModel)]="newPair.remotePath" />
          </div>
          <div class="d-flex justify-content-end">
            <button class="btn btn-xs btn-secondary mr-2" (click)="showNewPairModal = false">Cancel</button>
            <button class="btn btn-xs btn-primary" (click)="saveNewPair()">Save</button>
          </div>
        </div>
      </div>

      <!-- Settings Drawer -->
      <div *ngIf="activeTab === 'settings'" class="flex-grow-1" style="overflow-y: auto;">
        <div class="form-group mb-3">
          <label class="small font-weight-bold">Hide Native SFTP Button</label>
          <div class="custom-control custom-switch">
            <input
              type="checkbox"
              class="custom-control-input"
              id="hideSftpSwitch"
              [(ngModel)]="hideNativeSFTP"
              (change)="updateSettings()"
            />
            <label class="custom-control-label small" for="hideSftpSwitch">
              Hide Tabby's built-in SFTP button
            </label>
          </div>
        </div>

        <div class="form-group mb-3">
          <label class="small font-weight-bold">Transfer Dock Height (px)</label>
          <input
            type="number"
            class="form-control form-control-sm"
            [(ngModel)]="dockHeight"
            (change)="updateSettings()"
          />
        </div>
      </div>

      <!-- About Drawer -->
      <div *ngIf="activeTab === 'about'" class="flex-grow-1 small text-muted">
        <h6 class="text-white font-weight-bold mb-2">Tabby Secure Workbench</h6>
        <p class="mb-1">Version: 1.0.0</p>
        <p class="mb-2">License: MIT</p>
        <p class="mb-3">
          A pure Tabby plugin providing a unified SSH workbench, stateful multi-byte codec,
          per-tab transfer queues, verified session transcripts, and cross-connection copy/paste.
        </p>
        <div class="border-top pt-2">
          <p class="mb-1 text-white font-weight-bold">Components & Attribution:</p>
          <ul class="pl-3">
            <li>Tabby SFTP+ (MIT, Copyright DD1024z)</li>
            <li>Tabby Core & Terminal (MIT, Copyright Eugeny Pankov)</li>
          </ul>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .session-item, .pair-item {
        background: rgba(255, 255, 255, 0.03);
      }
      .session-item:hover, .pair-item:hover {
        background: rgba(255, 255, 255, 0.07);
      }
    `,
  ],
})
export class WorkbenchDrawerComponent {
  @Input() activeTab: ActivityTab = 'commands'
  @Input() activeTerminalTab: any
  @Input() availableSessions: any[] = []
  @Output() closeDrawer = new EventEmitter<void>()
  @Output() selectSession = new EventEmitter<any>()
  @Output() applyDirectoryPair = new EventEmitter<DirectoryPair>()

  sessionFilter = ''
  showNewPairModal = false

  newPair: DirectoryPair = {
    id: '',
    title: '',
    localPath: '',
    remotePath: '',
  }

  constructor(
    private config: ConfigService,
    private notifications: NotificationsService
  ) {}

  get title(): string {
    switch (this.activeTab) {
      case 'sessions':
        return 'Sessions'
      case 'commands':
        return 'Command Library'
      case 'pairs':
        return 'Directory Pairs'
      case 'settings':
        return 'Workbench Settings'
      case 'about':
        return 'About'
      default:
        return 'Drawer'
    }
  }

  get filteredSessions(): any[] {
    const q = this.sessionFilter.toLowerCase().trim()
    if (!q) return this.availableSessions
    return this.availableSessions.filter(
      s =>
        (s.title || '').toLowerCase().includes(q) ||
        (s.profile?.options?.host || '').toLowerCase().includes(q)
    )
  }

  get directoryPairs(): DirectoryPair[] {
    return this.config.store?.secureWorkbench?.directoryPairs || []
  }

  get hideNativeSFTP(): boolean {
    return !!this.config.store?.secureWorkbench?.hideNativeSFTPButton
  }

  set hideNativeSFTP(val: boolean) {
    if (!this.config.store.secureWorkbench) {
      this.config.store.secureWorkbench = { ...DEFAULT_WORKBENCH_CONFIG }
    }
    this.config.store.secureWorkbench.hideNativeSFTPButton = val
  }

  get dockHeight(): number {
    return this.config.store?.secureWorkbench?.dockHeight || 140
  }

  set dockHeight(val: number) {
    if (!this.config.store.secureWorkbench) {
      this.config.store.secureWorkbench = { ...DEFAULT_WORKBENCH_CONFIG }
    }
    this.config.store.secureWorkbench.dockHeight = val || 140
  }

  saveNewPair(): void {
    if (!this.newPair.title || (!this.newPair.localPath && !this.newPair.remotePath)) {
      this.notifications.error('Title and at least one path (local or remote) are required')
      return
    }

    const pairs = [...this.directoryPairs]
    pairs.push({
      ...this.newPair,
      id: `pair-${Date.now()}`,
    })

    if (!this.config.store.secureWorkbench) {
      this.config.store.secureWorkbench = { ...DEFAULT_WORKBENCH_CONFIG }
    }
    this.config.store.secureWorkbench.directoryPairs = pairs
    this.config.save()

    this.showNewPairModal = false
    this.newPair = { id: '', title: '', localPath: '', remotePath: '' }
  }

  deletePair(id: string): void {
    const pairs = this.directoryPairs.filter(p => p.id !== id)
    this.config.store.secureWorkbench.directoryPairs = pairs
    this.config.save()
  }

  updateSettings(): void {
    this.config.save()
  }
}
