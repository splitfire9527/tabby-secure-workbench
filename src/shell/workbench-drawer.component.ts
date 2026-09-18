import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, Optional } from '@angular/core'
import { ConfigService, NotificationsService, ProfilesService } from 'tabby-core'
import { Subscription } from 'rxjs'
import { ActivityTab } from './workbench-activity-bar.component'
import { DirectoryPair } from '../sftp-plus/directory-pair.model'
import { DEFAULT_WORKBENCH_CONFIG } from '../config/config.model'

interface ProfileFolderGroup {
  name: string
  profiles: any[]
  expanded: boolean
}

@Component({
  selector: 'workbench-drawer',
  template: `
    <!-- Drawer Title Header -->
    <div class="drawer-header">
      <div class="d-flex align-items-center">
        <span class="drawer-title">{{ title }}</span>
      </div>
      <button class="btn-close-drawer" (click)="closeDrawer.emit()" title="Hide Drawer">
        &times;
      </button>
    </div>

    <!-- 1. Sessions Drawer (SecureCRT Session Manager) -->
    <div *ngIf="activeTab === 'sessions'" class="drawer-panel">
      <!-- Session Manager Action Toolbar -->
      <div class="session-mgr-toolbar">
        <button
          class="btn-mgr-tool"
          [disabled]="!selectedProfile"
          (click)="connectSelected()"
          title="Connect Selected Session"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
          </svg>
          <span>Connect</span>
        </button>
        <button class="btn-mgr-tool" (click)="createNewSession()" title="New Session Profile">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>New</span>
        </button>
        <button class="btn-mgr-tool" (click)="toggleFolderGroupExpand()" title="Expand/Collapse All Folders">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
        </button>
        <button class="btn-mgr-tool" (click)="loadProfiles()" title="Refresh Sessions List">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
        </button>
      </div>

      <!-- Filter Box -->
      <div class="search-box">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#7f848e" stroke-width="2" class="search-icon">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input
          type="text"
          class="search-input"
          placeholder="Filter by folder/session name..."
          [(ngModel)]="sessionFilter"
        />
        <button *ngIf="sessionFilter" class="btn-clear-search" (click)="sessionFilter = ''">&times;</button>
      </div>

      <!-- Session Tree -->
      <div class="session-tree scrollable">
        <!-- Root Folder: Sessions -->
        <div class="tree-node tree-folder-root" (click)="rootExpanded = !rootExpanded">
          <span class="tree-arrow" [class.open]="rootExpanded">&#9656;</span>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="#e5c07b" stroke="none" class="mr-1">
            <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
          </svg>
          <span class="tree-label font-weight-bold">Sessions</span>
          <span class="badge badge-secondary badge-xs ml-auto">{{ totalProfilesCount }}</span>
        </div>

        <div *ngIf="rootExpanded" class="tree-children">
          <!-- Folder Groups -->
          <div *ngFor="let group of filteredGroups" class="tree-group-container">
            <div class="tree-node tree-folder" (click)="group.expanded = !group.expanded">
              <span class="tree-arrow" [class.open]="group.expanded">&#9656;</span>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="#e5c07b" stroke="none" class="mr-1">
                <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
              </svg>
              <span class="tree-label">{{ group.name }}</span>
              <span class="badge badge-secondary badge-xs ml-auto">{{ group.profiles.length }}</span>
            </div>

            <div *ngIf="group.expanded" class="tree-group-children">
              <div
                *ngFor="let p of group.profiles"
                class="tree-node session-card"
                [class.selected]="selectedProfile?.id === p.id"
                [class.active]="isProfileActive(p)"
                (click)="onSelectProfile(p)"
                (dblclick)="onConnectProfile(p)"
                [title]="getProfileTooltip(p)"
              >
                <div class="d-flex align-items-center justify-content-between">
                  <div class="d-flex align-items-center text-truncate gap-1">
                    <span class="status-dot" [class.online]="isProfileActive(p)"></span>
                    <span class="tree-label font-weight-bold text-truncate">{{ p.name }}</span>
                  </div>
                  <span class="badge badge-protocol font-mono">{{ getProfileTypeBadge(p) }}</span>
                </div>
                <div class="session-subtitle font-mono text-truncate pl-3">
                  {{ getProfileSubtitle(p) }}
                </div>
              </div>
            </div>
          </div>

          <!-- Ungrouped Profiles -->
          <div
            *ngFor="let p of filteredUngroupedProfiles"
            class="tree-node session-card"
            [class.selected]="selectedProfile?.id === p.id"
            [class.active]="isProfileActive(p)"
            (click)="onSelectProfile(p)"
            (dblclick)="onConnectProfile(p)"
            [title]="getProfileTooltip(p)"
          >
            <div class="d-flex align-items-center justify-content-between">
              <div class="d-flex align-items-center text-truncate gap-1">
                <span class="status-dot" [class.online]="isProfileActive(p)"></span>
                <span class="tree-label font-weight-bold text-truncate">{{ p.name }}</span>
              </div>
              <span class="badge badge-protocol font-mono">{{ getProfileTypeBadge(p) }}</span>
            </div>
            <div class="session-subtitle font-mono text-truncate pl-3">
              {{ getProfileSubtitle(p) }}
            </div>
          </div>

          <div *ngIf="totalProfilesCount === 0" class="text-muted small text-center p-3">
            No saved profiles found. Click "New" to create one.
          </div>
        </div>
      </div>

      <!-- Bottom Toolbar (SSH Pilot style: Edit, Trash, Key, Relay) -->
      <div class="drawer-bottom-bar d-flex align-items-center justify-content-between p-2 mt-auto">
        <div class="d-flex align-items-center gap-1">
          <button class="btn-mgr-tool-sm" title="Edit Profile" [disabled]="!selectedProfile" (click)="editSelectedProfile()">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
          <button class="btn-mgr-tool-sm" title="Credentials & Keys Manager">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m21 3-9.5 9.5"/><path d="m15.5 7.5 3 3M14 9l2 2"/></svg>
          </button>
          <button class="btn-mgr-tool-sm" title="Cross-Connection Relay Clipboard">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
          </button>
          <button class="btn-mgr-tool-sm text-danger" title="Delete Profile" [disabled]="!selectedProfile" (click)="deleteSelectedProfile()">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
        <span class="text-muted small font-mono">{{ totalProfilesCount }} Sessions</span>
      </div>
    </div>

    <!-- 2. Active Sessions Drawer -->
    <div *ngIf="activeTab === 'active-sessions'" class="drawer-panel scrollable">
      <div class="active-session-list">
        <div
          *ngFor="let s of availableSessions"
          class="active-session-item p-2 mb-1 rounded d-flex justify-content-between align-items-center"
          (click)="selectSession.emit(s)"
          [class.active]="s === activeTerminalTab"
        >
          <div class="text-truncate mr-2">
            <div class="font-weight-bold small text-truncate text-light">{{ s.title || s.name || 'Terminal Session' }}</div>
            <div class="text-muted small" style="font-size: 11px;">
              {{ s.profile?.options?.user || 'user' }}&#64;{{ s.profile?.options?.host || 'localhost' }}
            </div>
          </div>
          <span
            class="status-dot"
            [class.online]="s.session?.open !== false"
            [class.offline]="s.session?.open === false"
          ></span>
        </div>
        <div *ngIf="availableSessions.length === 0" class="text-muted small text-center p-3">
          No active terminal sessions open.
        </div>
      </div>
    </div>

    <!-- 3. Commands Drawer (Command Manager) -->
    <div *ngIf="activeTab === 'commands'" class="drawer-panel">
      <workbench-command-library [activeTerminalTab]="activeTerminalTab"></workbench-command-library>
    </div>

    <!-- 4. Directory Pairs Drawer -->
    <div *ngIf="activeTab === 'pairs'" class="drawer-panel scrollable">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <span class="small text-muted">{{ directoryPairs.length }} pair(s)</span>
        <button class="btn btn-xs btn-outline-primary" (click)="showNewPairModal = true">
          + New Pair
        </button>
      </div>

      <div *ngFor="let p of directoryPairs" class="pair-item p-2 mb-2 rounded">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="font-weight-bold small text-truncate text-light" [title]="p.title">{{ p.title }}</span>
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
      <div *ngIf="showNewPairModal" class="card p-3 mt-2 shadow border-secondary bg-dark text-light">
        <h6 class="small font-weight-bold mb-2">Add Directory Pair</h6>
        <div class="form-group mb-2">
          <label class="small">Title</label>
          <input type="text" class="form-control form-control-sm search-input" [(ngModel)]="newPair.title" />
        </div>
        <div class="form-group mb-2">
          <label class="small">Local Path</label>
          <input type="text" class="form-control form-control-sm search-input" [(ngModel)]="newPair.localPath" />
        </div>
        <div class="form-group mb-2">
          <label class="small">Remote Path</label>
          <input type="text" class="form-control form-control-sm search-input" [(ngModel)]="newPair.remotePath" />
        </div>
        <div class="d-flex justify-content-end">
          <button class="btn btn-xs btn-secondary mr-2" (click)="showNewPairModal = false">Cancel</button>
          <button class="btn btn-xs btn-primary" (click)="saveNewPair()">Save</button>
        </div>
      </div>
    </div>

    <!-- 5. Settings Drawer -->
    <div *ngIf="activeTab === 'settings'" class="drawer-panel scrollable">
      <div class="form-group mb-3">
        <label class="small font-weight-bold text-light">Hide Native SFTP Button</label>
        <div class="custom-control custom-switch">
          <input
            type="checkbox"
            class="custom-control-input"
            id="hideSftpSwitch"
            [(ngModel)]="hideNativeSFTP"
            (change)="updateSettings()"
          />
          <label class="custom-control-label small text-muted" for="hideSftpSwitch">
            Hide Tabby's built-in SFTP button
          </label>
        </div>
      </div>

      <div class="form-group mb-3">
        <label class="small font-weight-bold text-light">Transfer Dock Height (px)</label>
        <input
          type="number"
          class="form-control form-control-sm search-input"
          [(ngModel)]="dockHeight"
          (change)="updateSettings()"
        />
      </div>
    </div>

    <!-- 6. About Drawer -->
    <div *ngIf="activeTab === 'about'" class="drawer-panel scrollable small text-muted">
      <h6 class="text-white font-weight-bold mb-2">Tabby Secure Workbench</h6>
      <p class="mb-1">Version: 1.0.0</p>
      <p class="mb-2">License: MIT</p>
      <p class="mb-3">
        A professional SSH workbench plugin for Tabby inspired by SecureCRT, featuring Session Manager tree, Command Manager, Stateful Codec, per-tab transfer queues, verified session logging, and cross-connection transfer.
      </p>
      <div class="border-top border-secondary pt-2">
        <p class="mb-1 text-white font-weight-bold">Components & Attribution:</p>
        <ul class="pl-3">
          <li>Tabby SFTP+ (MIT, Copyright DD1024z)</li>
          <li>Tabby Core & Terminal (MIT, Copyright Eugeny Pankov)</li>
        </ul>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        width: 300px;
        min-width: 300px;
        max-width: 300px;
        height: 100%;
        background: #21252b;
        border-right: 1px solid #3e4451;
        padding: 8px 10px;
        box-sizing: border-box;
        flex-shrink: 0;
        overflow: hidden;
        user-select: none;
      }
      .drawer-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        flex-shrink: 0;
        height: 24px;
      }
      .drawer-title {
        font-weight: 700;
        text-transform: uppercase;
        margin: 0;
        color: #d7dae0;
        font-size: 11px;
        letter-spacing: 0.8px;
      }
      .btn-close-drawer {
        background: transparent;
        border: none;
        color: #7f848e;
        font-size: 18px;
        line-height: 1;
        padding: 0;
        cursor: pointer;
      }
      .btn-close-drawer:hover {
        color: #fff;
      }
      .session-mgr-toolbar {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-bottom: 8px;
        padding-bottom: 6px;
        border-bottom: 1px solid rgba(62, 68, 81, 0.6);
        flex-shrink: 0;
      }
      .btn-mgr-tool {
        background: #282c34;
        border: 1px solid #3e4451;
        border-radius: 4px;
        color: #abb2bf;
        font-size: 11px;
        padding: 3px 7px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .btn-mgr-tool:hover:not([disabled]) {
        background: #3a3f4b;
        color: #fff;
        border-color: #61afef;
      }
      .btn-mgr-tool[disabled] {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .search-box {
        position: relative;
        display: flex;
        align-items: center;
        margin-bottom: 8px;
        flex-shrink: 0;
      }
      .search-icon {
        position: absolute;
        left: 8px;
        pointer-events: none;
      }
      .search-input {
        width: 100%;
        background: #1e2227 !important;
        border: 1px solid #3e4451 !important;
        color: #abb2bf !important;
        border-radius: 4px;
        padding: 4px 24px 4px 26px;
        font-size: 12px;
        outline: none;
        box-sizing: border-box;
      }
      .search-input:focus {
        border-color: #61afef !important;
        box-shadow: 0 0 0 1px rgba(97, 175, 239, 0.4);
      }
      .search-input::placeholder {
        color: #5c6370;
        font-size: 11px;
      }
      .btn-clear-search {
        position: absolute;
        right: 6px;
        background: none;
        border: none;
        color: #7f848e;
        font-size: 14px;
        cursor: pointer;
        padding: 0;
      }
      .drawer-panel {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        min-height: 0;
      }
      .drawer-panel.scrollable {
        overflow-y: auto;
      }
      .session-tree {
        flex: 1;
        overflow-y: auto;
        min-height: 0;
      }
      .tree-node {
        display: flex;
        align-items: center;
        height: 26px;
        padding: 0 6px;
        border-radius: 3px;
        cursor: pointer;
        font-size: 12px;
        color: #abb2bf;
        transition: background 0.1s ease;
      }
      .tree-node:hover {
        background: rgba(255, 255, 255, 0.06);
        color: #fff;
      }
      .tree-node.selected {
        background: rgba(97, 175, 239, 0.2);
        color: #fff;
        border: 1px solid rgba(97, 175, 239, 0.4);
      }
      .tree-node.active {
        /* SecureCRT red highlight for active connected session */
        background: #be5046 !important;
        color: #ffffff !important;
        font-weight: 600;
      }
      .tree-arrow {
        width: 14px;
        display: inline-block;
        font-size: 10px;
        color: #7f848e;
        transition: transform 0.15s ease;
      }
      .tree-arrow.open {
        transform: rotate(90deg);
      }
      .tree-children {
        padding-left: 12px;
      }
      .tree-group-children {
        padding-left: 14px;
      }
      .leaf-icon {
        margin-right: 6px;
        flex-shrink: 0;
        color: #61afef;
      }
      .tree-node.active .leaf-icon {
        color: #fff !important;
      }
      .tree-label {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .badge-xs {
        font-size: 9px;
        padding: 1px 4px;
        border-radius: 8px;
        background: #3e4451;
        color: #abb2bf;
      }
      .status-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        display: inline-block;
        flex-shrink: 0;
      }
      .status-dot.online {
        background: #98c379;
        box-shadow: 0 0 6px rgba(152, 195, 121, 0.6);
      }
      .status-dot.offline {
        background: #e06c75;
      }
      .session-card {
        display: flex !important;
        flex-direction: column !important;
        align-items: stretch !important;
        height: auto !important;
        min-height: 40px !important;
        padding: 5px 8px !important;
        border-radius: 4px !important;
        border: 1px solid transparent !important;
        margin-bottom: 3px !important;
        background: rgba(255, 255, 255, 0.02) !important;
        cursor: pointer !important;
        transition: background 0.15s ease, border-color 0.15s ease !important;

        &:hover {
          background: #282c34 !important;
          border-color: #3e4451 !important;
        }

        &.selected {
          background: #2c313a !important;
          border-color: #4b5263 !important;
        }

        &.active {
          border-color: rgba(190, 80, 70, 0.7) !important;
          background: rgba(190, 80, 70, 0.2) !important;
          color: #ffffff !important;

          .tree-label {
            color: #ffffff !important;
          }
          .session-subtitle {
            color: #e5c07b !important;
          }
        }

        .session-subtitle {
          font-size: 10px !important;
          color: #7f848e !important;
          margin-top: 2px !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
        }

        .badge-protocol {
          font-size: 9px !important;
          padding: 1px 4px !important;
          border-radius: 3px !important;
          background: rgba(190, 80, 70, 0.2) !important;
          color: #e06c75 !important;
          font-family: monospace !important;
        }
      }
      .drawer-bottom-bar {
        background: #181a1f !important;
        border-top: 1px solid #282c34 !important;
        min-height: 32px !important;
        box-sizing: border-box !important;

        .btn-mgr-tool-sm {
          background: none !important;
          border: none !important;
          color: #abb2bf !important;
          padding: 3px 5px !important;
          border-radius: 3px !important;
          cursor: pointer !important;

          &:hover:not(:disabled) {
            background: #282c34 !important;
            color: #ffffff !important;
          }

          &:disabled {
            opacity: 0.3 !important;
            cursor: default !important;
          }
        }
      }
      .active-session-item,
      .pair-item {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.06);
        cursor: pointer;
        transition: background 0.15s ease;
      }
      .active-session-item:hover,
      .pair-item:hover {
        background: rgba(255, 255, 255, 0.07);
      }
      .active-session-item.active {
        border-color: #61afef;
        background: rgba(97, 175, 239, 0.14);
      }
    `,
  ],
})
export class WorkbenchDrawerComponent implements OnInit, OnDestroy {
  @Input() activeTab: ActivityTab = 'sessions'
  @Input() activeTerminalTab: any
  @Input() activeProfile: any
  @Input() availableSessions: any[] = []
  @Output() closeDrawer = new EventEmitter<void>()
  @Output() selectSession = new EventEmitter<any>()
  @Output() connectProfile = new EventEmitter<any>()
  @Output() applyDirectoryPair = new EventEmitter<DirectoryPair>()

  sessionFilter = ''
  rootExpanded = true
  selectedProfile: any = null
  savedProfiles: any[] = []

  showNewPairModal = false
  newPair: DirectoryPair = {
    id: '',
    title: '',
    localPath: '',
    remotePath: '',
  }

  private subs: Subscription[] = []

  constructor(
    private config: ConfigService,
    private notifications: NotificationsService,
    @Optional() private profilesService?: ProfilesService
  ) {}

  ngOnInit(): void {
    this.loadProfiles()
    if (this.config.changed$) {
      this.subs.push(
        this.config.changed$.subscribe(() => {
          this.loadProfiles()
        })
      )
    }
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe())
  }

  get title(): string {
    switch (this.activeTab) {
      case 'sessions':
        return 'Session Manager'
      case 'commands':
        return 'Command Manager'
      case 'active-sessions':
        return 'Active Sessions'
      case 'pairs':
        return 'Directory Pairs'
      case 'settings':
        return 'Settings'
      case 'about':
        return 'About'
      default:
        return 'Drawer'
    }
  }

  async loadProfiles(): Promise<void> {
    if (this.profilesService) {
      try {
        const profiles = await this.profilesService.getProfiles()
        // Filter out workbench profile itself so it doesn't nest into itself
        this.savedProfiles = (profiles || []).filter((p: any) => p.type !== 'workbench')
      } catch (err) {
        console.warn('[Workbench] Error loading profiles', err)
      }
    } else if (this.config.store?.profiles) {
      this.savedProfiles = (this.config.store.profiles || []).filter((p: any) => p.type !== 'workbench')
    }
  }

  get totalProfilesCount(): number {
    return this.savedProfiles.length
  }

  get filteredGroups(): ProfileFolderGroup[] {
    const q = this.sessionFilter.toLowerCase().trim()
    const groupMap = new Map<string, any[]>()

    for (const p of this.savedProfiles) {
      if (p.group) {
        if (!groupMap.has(p.group)) groupMap.set(p.group, [])
        groupMap.get(p.group)!.push(p)
      }
    }

    const groups: ProfileFolderGroup[] = []
    for (const [name, profiles] of groupMap.entries()) {
      const filtered = q
        ? profiles.filter(
            p =>
              (p.name || '').toLowerCase().includes(q) ||
              (p.options?.host || '').toLowerCase().includes(q) ||
              name.toLowerCase().includes(q)
          )
        : profiles

      if (filtered.length > 0) {
        groups.push({
          name,
          profiles: filtered,
          expanded: true,
        })
      }
    }

    return groups
  }

  get filteredUngroupedProfiles(): any[] {
    const q = this.sessionFilter.toLowerCase().trim()
    const ungrouped = this.savedProfiles.filter(p => !p.group)
    if (!q) return ungrouped
    return ungrouped.filter(
      p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.options?.host || '').toLowerCase().includes(q) ||
        (p.options?.user || '').toLowerCase().includes(q)
    )
  }

  onSelectProfile(p: any): void {
    this.selectedProfile = p
  }

  onConnectProfile(p: any): void {
    this.selectedProfile = p
    this.connectProfile.emit(p)
  }

  connectSelected(): void {
    if (this.selectedProfile) {
      this.connectProfile.emit(this.selectedProfile)
    }
  }

  async createNewSession(): Promise<void> {
    if (this.profilesService) {
      try {
        const p = await this.profilesService.showProfileSelector()
        if (p) {
          this.loadProfiles()
          this.onConnectProfile(p)
        }
      } catch (err) {
        console.warn('[Workbench] Error showing profile selector', err)
      }
    }
  }

  toggleFolderGroupExpand(): void {
    this.rootExpanded = !this.rootExpanded
  }

  isProfileActive(profile: any): boolean {
    if (!profile) return false
    if (this.activeProfile && this.activeProfile.id === profile.id) return true
    if (
      this.activeTerminalTab?.profile &&
      (this.activeTerminalTab.profile.id === profile.id ||
        (this.activeTerminalTab.profile.options?.host &&
          this.activeTerminalTab.profile.options?.host === profile.options?.host))
    ) {
      return true
    }
    return false
  }

  getProfileTooltip(p: any): string {
    const user = p.options?.user || 'user'
    const host = p.options?.host || 'localhost'
    const port = p.options?.port || 22
    return `${p.name} (${user}@${host}:${port})`
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

  getProfileTypeBadge(p: any): string {
    if (!p) return 'SSH2'
    const type = (p.type || '').toUpperCase()
    if (type.includes('SERIAL')) return 'SERIAL'
    if (type.includes('TELNET')) return 'TELNET'
    if (type.includes('LOCAL')) return 'LOCAL'
    return 'SSH2'
  }

  getProfileSubtitle(p: any): string {
    if (!p) return ''
    if (p.options?.host) {
      return `${p.options.user || 'root'}@${p.options.host}:${p.options.port || 22}`
    }
    if (p.options?.command) {
      return p.options.command
    }
    return p.type || 'terminal'
  }

  editSelectedProfile(): void {
    if (!this.selectedProfile) return
    this.notifications.info(`Editing profile ${this.selectedProfile.name}...`)
  }

  deleteSelectedProfile(): void {
    if (!this.selectedProfile) return
    this.savedProfiles = this.savedProfiles.filter(p => p.id !== this.selectedProfile.id)
    this.selectedProfile = null
    this.notifications.info('Profile deleted from current view.')
  }
}
