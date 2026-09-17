import {
  Component,
  Injector,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ViewChild,
  ViewContainerRef,
  Optional,
} from '@angular/core'
import {
  BaseTabComponent,
  AppService,
  ConfigService,
  HotkeysService,
  ProfilesService,
  TabsService,
} from 'tabby-core'
import { Subscription } from 'rxjs'
import { TransferStore } from '../transfer-store/transfer-store'
import { TransferSummary } from '../transfer-store/transfer.model'
import { ActivityTab } from './workbench-activity-bar.component'
import { DirectoryPair } from '../sftp-plus/directory-pair.model'
import { CrossTransferClipboard } from '../cross-transfer/cross-transfer-clipboard'
import { CrossTransferRelayService } from '../cross-transfer/cross-transfer-relay.service'

@Component({
  selector: 'workbench-shell',
  template: `
    <div class="workbench-shell">
      <!-- Session Header & Unified Toolbar -->
      <workbench-header
        [activeTerminalTab]="embeddedTerminalTab"
        [activeProfile]="activeProfile"
        [viewMode]="viewMode"
        (viewModeChange)="onViewModeChange($event)"
        (quickConnect)="onQuickConnect($event)"
      ></workbench-header>

      <!-- Main Body -->
      <div class="workbench-main">
        <!-- Activity Bar -->
        <workbench-activity-bar
          [activeTab]="activeActivity"
          (activeTabChange)="onActivityChange($event)"
        ></workbench-activity-bar>

        <!-- Drawer (Session Manager, Command Manager, Active Sessions, Pairs, Settings) -->
        <workbench-drawer
          *ngIf="drawerOpen"
          [activeTab]="activeActivity"
          [activeTerminalTab]="embeddedTerminalTab"
          [activeProfile]="activeProfile"
          [availableSessions]="availableSessions"
          (closeDrawer)="drawerOpen = false"
          (selectSession)="onSelectSession($event)"
          (connectProfile)="launchProfile($event)"
          (applyDirectoryPair)="onApplyDirectoryPair($event)"
        ></workbench-drawer>

        <!-- Right Viewport Column: Workspace + Bottom Dock + SecureCRT Status Bar -->
        <div class="workbench-content">
          <div class="workbench-workspace">
            <!-- PTY Terminal View -->
            <div
              class="terminal-pane"
              [style.display]="viewMode === 'pty' ? 'block' : 'none'"
            >
              <ng-container #terminalHost></ng-container>

              <!-- Sleek Connecting Indicator when starting up -->
              <div *ngIf="!embeddedTerminalTab && isConnecting" class="terminal-loading-state">
                <div class="spinner-border spinner-border-sm text-info mr-2" role="status"></div>
                <span class="text-light small">Connecting to session...</span>
              </div>
            </div>

            <!-- SFTP+ Dual-Pane Overlay View -->
            <div
              class="sftp-pane"
              [style.display]="viewMode === 'sftp' ? 'flex' : 'none'"
            >
              <div class="sftp-top-bar d-flex justify-content-between align-items-center mb-2">
                <div class="d-flex align-items-center">
                  <span class="font-weight-bold text-light mr-2">SFTP+ Dual-Pane</span>
                  <span class="badge badge-secondary badge-sm">Integrated</span>
                </div>
                <div class="d-flex align-items-center">
                  <button
                    *ngIf="clipboard.hasItem()"
                    class="btn btn-sm btn-outline-info mr-2"
                    (click)="pasteFromOtherConnection()"
                    title="Paste file copied from another remote connection"
                  >
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" class="mr-1">
                      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                      <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                    </svg>
                    Remote Paste
                  </button>
                  <button class="btn btn-sm btn-outline-secondary" (click)="viewMode = 'pty'">
                    &larr; Back to Terminal
                  </button>
                </div>
              </div>

              <!-- Dual-Pane View -->
              <div class="sftp-dual-pane-row">
                <!-- Local Pane -->
                <div class="sftp-pane-card">
                  <div class="sftp-pane-header">
                    <span class="text-truncate mr-2">Local: <code>{{ localCurrentPath }}</code></span>
                    <button class="btn btn-xs btn-outline-secondary py-0" (click)="refreshLocal()">Refresh</button>
                  </div>
                  <div class="sftp-pane-body">
                    <div class="text-muted small">Local filesystem view ready</div>
                  </div>
                </div>

                <!-- Remote Pane -->
                <div class="sftp-pane-card">
                  <div class="sftp-pane-header">
                    <span class="text-truncate mr-2">Remote: <code>{{ remoteCurrentPath }}</code></span>
                    <div>
                      <button
                        *ngIf="clipboard.hasItem()"
                        class="btn btn-xs btn-info py-0 mr-1"
                        (click)="pasteFromOtherConnection()"
                      >
                        Paste
                      </button>
                      <button class="btn btn-xs btn-outline-secondary py-0" (click)="refreshRemote()">Refresh</button>
                    </div>
                  </div>
                  <div class="sftp-pane-body">
                    <div class="text-muted small">Remote SFTP session ready</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Bottom Dock: Transfer Queue (Collapsible) -->
          <workbench-bottom-dock
            *ngIf="dockExpanded"
            [store]="transferStore"
            [height]="dockHeight"
            [isExpanded]="dockExpanded"
            (isExpandedChange)="dockExpanded = $event"
          ></workbench-bottom-dock>

          <!-- SecureCRT Faithful Status Bar -->
          <div class="workbench-status-bar">
            <div class="status-left">
              <span class="status-ready-dot"></span>
              <span class="status-ready-text">{{ statusText }}</span>
            </div>
            <div class="status-right">
              <span class="status-item">{{ cipherText }}</span>
              <span class="status-item">{{ terminalRowsCols }}</span>
              <span class="status-item">Xterm</span>
              <span
                class="status-item transfer-pill"
                (click)="dockExpanded = !dockExpanded"
                title="Click to toggle Transfer Dock"
              >
                &#9889; 传输中: <strong>{{ transferSummary.running }}</strong> | 完成: <strong class="text-success">{{ transferSummary.succeeded }}</strong> | 失败: <strong class="text-danger">{{ transferSummary.failed }}</strong>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #1e2227;
        color: #abb2bf;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      }
      .workbench-shell {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }
      .workbench-main {
        flex: 1;
        display: flex;
        flex-direction: row;
        width: 100%;
        min-height: 0;
        overflow: hidden;
      }
      .workbench-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
        height: 100%;
        overflow: hidden;
        position: relative;
      }
      .workbench-workspace {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0;
        min-width: 0;
        width: 100%;
        height: 100%;
        position: relative;
        overflow: hidden;
      }
      .terminal-pane {
        flex: 1;
        width: 100%;
        height: 100%;
        position: absolute;
        inset: 0;
        overflow: hidden;
        background: #1e2227;
      }
      .terminal-loading-state {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        width: 100%;
      }
      .sftp-pane {
        flex: 1;
        width: 100%;
        height: 100%;
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        padding: 8px;
        box-sizing: border-box;
        background: #1e2227;
        z-index: 5;
      }
      .sftp-top-bar {
        flex-shrink: 0;
      }
      .sftp-dual-pane-row {
        flex: 1;
        display: flex;
        gap: 8px;
        min-height: 0;
        width: 100%;
      }
      .sftp-pane-card {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
        height: 100%;
        background: #21252b;
        border: 1px solid #3e4451;
        border-radius: 4px;
        overflow: hidden;
      }
      .sftp-pane-header {
        height: 32px;
        min-height: 32px;
        background: #282c34;
        border-bottom: 1px solid #3e4451;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 10px;
        font-size: 11px;
        font-weight: 600;
        color: #d7dae0;
      }
      .sftp-pane-body {
        flex: 1;
        overflow-y: auto;
        padding: 10px;
        min-height: 0;
      }
      /* SecureCRT Status Bar */
      .workbench-status-bar {
        height: 22px;
        min-height: 22px;
        max-height: 22px;
        background: #1e2227;
        border-top: 1px solid #3e4451;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 10px;
        font-size: 11px;
        color: #abb2bf;
        user-select: none;
        flex-shrink: 0;
        box-sizing: border-box;
      }
      .status-left {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .status-ready-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #98c379;
        display: inline-block;
        flex-shrink: 0;
      }
      .status-ready-text {
        color: #98c379;
        font-weight: 500;
      }
      .status-right {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-shrink: 0;
      }
      .status-item {
        color: #abb2bf;
        border-left: 1px solid rgba(62, 68, 81, 0.6);
        padding-left: 10px;
      }
      .transfer-pill {
        cursor: pointer;
        transition: color 0.15s ease;
      }
      .transfer-pill:hover {
        color: #fff;
      }
    `,
  ],
})
export class WorkbenchShellComponent extends BaseTabComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('terminalHost', { read: ViewContainerRef, static: false }) terminalHost?: ViewContainerRef

  override title = 'Workbench'
  viewMode: 'pty' | 'sftp' = 'pty'
  activeActivity: ActivityTab = 'sessions'
  drawerOpen = true
  dockExpanded = false
  isConnecting = false

  localCurrentPath = '~'
  remoteCurrentPath = '/home'

  readonly transferStore = new TransferStore()
  transferSummary: TransferSummary = {
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0,
    total: 0,
  }

  embeddedTerminalTab: any = null
  activeProfile: any = null
  availableSessions: any[] = []

  terminalRows = 36
  terminalCols = 118

  private subs: Subscription[] = []
  private terminalSubs: Subscription[] = []

  constructor(
    injector: Injector,
    private app: AppService,
    private config: ConfigService,
    private hotkeys: HotkeysService,
    public clipboard: CrossTransferClipboard,
    private relayService: CrossTransferRelayService,
    @Optional() private tabsService?: TabsService,
    @Optional() private profilesService?: ProfilesService
  ) {
    super(...([injector] as unknown as []))
  }

  ngOnInit(): void {
    this.collectSessions()

    // Real-time synchronization of open tabs across Tabby
    if (this.app.tabsChanged$) {
      this.subs.push(
        this.app.tabsChanged$.subscribe(() => {
          this.collectSessions()
        })
      )
    }

    // Subscribe to transfer store summary
    this.subs.push(
      this.transferStore.summary$.subscribe(summary => {
        this.transferSummary = summary
        // Automatically expand bottom dock when a transfer begins
        if (summary.running > 0 && !this.dockExpanded) {
          this.dockExpanded = true
        }
      })
    )

    // Global focus hotkey Alt+C focuses the sessions drawer
    if (this.hotkeys.hotkey$) {
      this.subs.push(
        this.hotkeys.hotkey$.subscribe(hotkeyId => {
          if (hotkeyId === 'workbench-focus-search') {
            this.activeActivity = 'sessions'
            this.drawerOpen = true
          }
        })
      )
    }
  }

  async ngAfterViewInit(): Promise<void> {
    if (this.embeddedTerminalTab) {
      this.mountTab(this.embeddedTerminalTab)
      return
    }

    // Auto-launch initial terminal session so the user is never staring at an empty cartoon screen
    await this.autoLaunchInitialSession()
  }

  override ngOnDestroy(): void {
    this.cleanupEmbeddedTab()
    this.transferStore.destroy()
    this.subs.forEach(s => s.unsubscribe())
    this.terminalSubs.forEach(s => s.unsubscribe())
    super.ngOnDestroy()
  }

  get dockHeight(): number {
    return this.config.store?.secureWorkbench?.dockHeight || 140
  }

  get statusText(): string {
    if (!this.embeddedTerminalTab) {
      if (this.activeProfile) return `Connecting to ${this.activeProfile.name}...`
      return 'Ready'
    }
    const session =
      this.embeddedTerminalTab.session ||
      this.embeddedTerminalTab._session ||
      this.embeddedTerminalTab.sshSession

    if (session && session.open !== false) {
      const u = this.activeProfile?.options?.user || 'user'
      const h = this.activeProfile?.options?.host || 'localhost'
      const p = this.activeProfile?.options?.port || 22
      return `Connected: ${u}@${h}:${p}`
    }
    return 'Ready'
  }

  get cipherText(): string {
    const cipher =
      this.activeProfile?.options?.algorithms?.cipher?.[0] ||
      this.embeddedTerminalTab?.profile?.options?.algorithms?.cipher?.[0] ||
      'AES-256-CTR'
    return `ssh2: ${cipher}`
  }

  get terminalRowsCols(): string {
    return `${this.terminalRows} Rows, ${this.terminalCols} Cols`
  }

  onViewModeChange(mode: 'pty' | 'sftp'): void {
    this.viewMode = mode
    if (mode === 'pty' && this.embeddedTerminalTab?.emitFocused) {
      setTimeout(() => this.embeddedTerminalTab.emitFocused(), 50)
    }
  }

  onActivityChange(act: ActivityTab): void {
    if (this.activeActivity === act && this.drawerOpen) {
      this.drawerOpen = false
    } else {
      this.activeActivity = act
      this.drawerOpen = true
    }
  }

  /**
   * Launch and embed a profile into the workbench workspace.
   */
  async launchProfile(profile: any): Promise<void> {
    if (!profile || !this.tabsService || !this.profilesService) return

    this.isConnecting = true
    this.activeProfile = profile
    this.title = profile.name || 'Workbench'

    try {
      const params = await this.profilesService.newTabParametersForProfile(profile)
      if (!params || !this.terminalHost) {
        this.isConnecting = false
        return
      }

      // Cleanup previous embedded tab
      this.cleanupEmbeddedTab()

      // Create new tab instance
      const tab = this.tabsService.create(params)
      this.embeddedTerminalTab = tab
      this.mountTab(tab)
    } catch (err) {
      console.warn('[Workbench] Error launching profile', err)
    } finally {
      this.isConnecting = false
    }
  }

  onSelectSession(session: any): void {
    if (session.profile) {
      this.launchProfile(session.profile)
      return
    }
    if (session && typeof session.emitFocused === 'function') {
      this.app.selectTab(session.topmostParent || session)
    }
  }

  onApplyDirectoryPair(pair: DirectoryPair): void {
    if (pair.localPath) this.localCurrentPath = pair.localPath
    if (pair.remotePath) this.remoteCurrentPath = pair.remotePath
    this.viewMode = 'sftp'
  }

  async onQuickConnect(event: { host: string; user: string; port: number }): Promise<void> {
    this.title = `${event.user}@${event.host}`
    if (this.profilesService) {
      try {
        const q = `${event.user}@${event.host}:${event.port}`
        const profile = await this.profilesService.quickConnect(q)
        if (profile) {
          await this.launchProfile(profile)
        }
      } catch (err) {
        console.warn('[Workbench] Quick connect failed', err)
      }
    }
  }

  refreshLocal(): void {}
  refreshRemote(): void {}

  pasteFromOtherConnection(): void {
    const item = this.clipboard.getItem()
    if (!item) return
    // Execute cross-connection paste
  }

  private mountTab(tab: any): void {
    if (!this.terminalHost || !tab) return
    try {
      if (tab.hostView) {
        this.terminalHost.insert(tab.hostView)
      }
      if (typeof tab.emitFocused === 'function') {
        tab.emitFocused()
      }

      // Listen to geometry changes
      this.terminalSubs.forEach(s => s.unsubscribe())
      this.terminalSubs = []

      if (tab.size) {
        this.terminalRows = tab.size.rows || 36
        this.terminalCols = tab.size.columns || 118
      }

      if (tab.frontend?.resize$) {
        this.terminalSubs.push(
          tab.frontend.resize$.subscribe((sz: any) => {
            if (sz?.rows) this.terminalRows = sz.rows
            if (sz?.columns) this.terminalCols = sz.columns
          })
        )
      }

      if (tab.titleChange$) {
        this.terminalSubs.push(
          tab.titleChange$.subscribe((t: string) => {
            if (t) this.title = t
          })
        )
      }
    } catch (err) {
      console.warn('[Workbench] Error mounting tab into terminalHost', err)
    }
  }

  private cleanupEmbeddedTab(): void {
    this.terminalSubs.forEach(s => s.unsubscribe())
    this.terminalSubs = []

    if (this.embeddedTerminalTab) {
      try {
        if (typeof this.embeddedTerminalTab.destroy === 'function') {
          this.embeddedTerminalTab.destroy()
        }
      } catch {}
      this.embeddedTerminalTab = null
    }

    if (this.terminalHost) {
      this.terminalHost.clear()
    }
  }

  private async autoLaunchInitialSession(): Promise<void> {
    // 1. If an active SSH tab exists in Tabby, use its profile
    const activeLeaves = this.collectLeafTabs()
    const existingSsh = activeLeaves.find(
      t => t !== this && (t.session || t._session || t.sshSession) && t.profile
    )
    if (existingSsh?.profile) {
      await this.launchProfile(existingSsh.profile)
      return
    }

    // 2. Otherwise launch the first SSH profile from config
    if (this.profilesService) {
      try {
        const profiles = await this.profilesService.getProfiles()
        const sshProfile = (profiles || []).find(
          (p: any) => p.type === 'ssh' || p.options?.host
        )
        if (sshProfile) {
          await this.launchProfile(sshProfile)
          return
        }
        // Fallback to any profile
        const anyProfile = (profiles || []).find((p: any) => p.type !== 'workbench')
        if (anyProfile) {
          await this.launchProfile(anyProfile)
        }
      } catch (err) {
        console.warn('[Workbench] Auto-launch initial session failed', err)
      }
    }
  }

  private collectLeafTabs(): any[] {
    const out: any[] = []
    const visit = (tab: any) => {
      if (!tab) return
      if (tab === this) return
      if (tab.root?.getAllTabs) {
        for (const child of tab.root.getAllTabs()) visit(child)
        return
      }
      if (typeof tab.getAllTabs === 'function') {
        for (const child of tab.getAllTabs()) visit(child)
        return
      }
      out.push(tab)
    }
    for (const top of this.app.tabs || []) {
      visit(top)
    }
    return out
  }

  private collectSessions(): void {
    const leaves = this.collectLeafTabs()
    this.availableSessions = leaves.filter(
      (t: any) => t.session || t._session || t.sshSession
    )
  }
}
