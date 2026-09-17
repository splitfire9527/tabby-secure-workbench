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
} from 'tabby-core'
import { Subscription } from 'rxjs'
import { TransferStore } from '../transfer-store/transfer-store'
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

        <!-- Drawer -->
        <workbench-drawer
          *ngIf="drawerOpen"
          [activeTab]="activeActivity"
          [activeTerminalTab]="embeddedTerminalTab"
          [availableSessions]="availableSessions"
          (closeDrawer)="drawerOpen = false"
          (selectSession)="onSelectSession($event)"
          (applyDirectoryPair)="onApplyDirectoryPair($event)"
        ></workbench-drawer>

        <!-- Right Viewport Column: Workspace Viewport + Bottom Dock -->
        <div class="workbench-content">
          <div class="workbench-workspace">
            <!-- PTY Terminal View -->
            <div
              class="terminal-pane"
              [style.display]="viewMode === 'pty' ? 'block' : 'none'"
            >
              <ng-container #terminalHost></ng-container>
              <div *ngIf="!embeddedTerminalTab" class="no-session-placeholder">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#4b5263" stroke-width="1.5">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                  <line x1="8" y1="21" x2="16" y2="21"></line>
                  <line x1="12" y1="17" x2="12" y2="21"></line>
                </svg>
                <h6 class="mt-3 mb-1 text-light">No Active Terminal</h6>
                <p class="text-muted small mb-3">Select an active session from the drawer or launch a new terminal.</p>
                <button class="btn btn-sm btn-primary" (click)="launchDefaultTerminal()">
                  + Open Terminal
                </button>
              </div>
            </div>

            <!-- SFTP+ Overlay View -->
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

          <!-- Bottom Dock: Transfer Queue -->
          <workbench-bottom-dock
            [store]="transferStore"
            [height]="dockHeight"
          ></workbench-bottom-dock>
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
        position: relative;
        overflow: hidden;
        background: #1e2227;
      }
      .no-session-placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        width: 100%;
        text-align: center;
      }
      .sftp-pane {
        flex: 1;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        padding: 12px;
        box-sizing: border-box;
      }
      .sftp-top-bar {
        flex-shrink: 0;
      }
      .sftp-dual-pane-row {
        flex: 1;
        display: flex;
        gap: 12px;
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
        height: 36px;
        min-height: 36px;
        background: #282c34;
        border-bottom: 1px solid #3e4451;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 10px;
        font-size: 12px;
        font-weight: 600;
        color: #d7dae0;
      }
      .sftp-pane-body {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
        min-height: 0;
      }
    `,
  ],
})
export class WorkbenchShellComponent extends BaseTabComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('terminalHost', { read: ViewContainerRef, static: false }) terminalHost?: ViewContainerRef

  override title = 'Workbench'
  viewMode: 'pty' | 'sftp' = 'pty'
  activeActivity: ActivityTab = 'commands'
  drawerOpen = true

  localCurrentPath = '~'
  remoteCurrentPath = '/home'

  /**
   * Each Workbench Tab owns an isolated TransferStore instance.
   */
  readonly transferStore = new TransferStore()

  embeddedTerminalTab: any = null
  availableSessions: any[] = []

  private subs: Subscription[] = []

  constructor(
    injector: Injector,
    private app: AppService,
    private config: ConfigService,
    private hotkeys: HotkeysService,
    public clipboard: CrossTransferClipboard,
    private relayService: CrossTransferRelayService,
    @Optional() private profilesService?: ProfilesService
  ) {
    super(...([injector] as unknown as []))
  }

  ngOnInit(): void {
    this.collectSessions()

    // Real-time synchronization of open tabs
    if (this.app.tabsChanged$) {
      this.subs.push(
        this.app.tabsChanged$.subscribe(() => {
          this.collectSessions()
        })
      )
    }

    // Global focus hotkey Alt+C
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

  ngAfterViewInit(): void {
    if (this.embeddedTerminalTab) {
      this.attachTerminalTab(this.embeddedTerminalTab)
    }
  }

  override ngOnDestroy(): void {
    this.detachTerminalTab(this.embeddedTerminalTab)
    // §4.1 #2: Closing the tab automatically cancels all running/queued tasks and cleans up
    this.transferStore.destroy()
    this.subs.forEach(s => s.unsubscribe())
    super.ngOnDestroy()
  }

  get dockHeight(): number {
    return this.config.store?.secureWorkbench?.dockHeight || 140
  }

  onViewModeChange(mode: 'pty' | 'sftp'): void {
    this.viewMode = mode
  }

  onActivityChange(act: ActivityTab): void {
    if (this.activeActivity === act && this.drawerOpen) {
      this.drawerOpen = false
    } else {
      this.activeActivity = act
      this.drawerOpen = true
    }
  }

  onSelectSession(session: any): void {
    if (this.embeddedTerminalTab && this.embeddedTerminalTab !== session) {
      this.detachTerminalTab(this.embeddedTerminalTab)
    }
    this.embeddedTerminalTab = session
    this.title = session.title || 'Workbench Session'
    this.attachTerminalTab(session)
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
          const tab = await this.profilesService.openNewTabForProfile(profile)
          if (tab) {
            this.onSelectSession(tab)
          }
        }
      } catch (err) {
        console.warn('[Workbench] Quick connect failed', err)
      }
    }
  }

  async launchDefaultTerminal(): Promise<void> {
    this.collectSessions()
    if (this.embeddedTerminalTab) {
      this.attachTerminalTab(this.embeddedTerminalTab)
      return
    }

    if (this.profilesService) {
      try {
        const profile = await this.profilesService.showProfileSelector()
        if (profile) {
          const tab = await this.profilesService.openNewTabForProfile(profile)
          if (tab) {
            this.onSelectSession(tab)
          }
        }
      } catch (err) {
        console.warn('[Workbench] Could not launch terminal from selector', err)
      }
    }
  }

  refreshLocal(): void {}
  refreshRemote(): void {}

  pasteFromOtherConnection(): void {
    const item = this.clipboard.getItem()
    if (!item) return

    // Execute remote paste into target directory
    // Source client is pulled from clipboard reference or session
  }

  private attachTerminalTab(tab: any): void {
    if (!this.terminalHost || !tab) return
    try {
      if (typeof tab.removeFromContainer === 'function') {
        tab.removeFromContainer()
      }
      if (typeof tab.insertIntoContainer === 'function') {
        tab.insertIntoContainer(this.terminalHost)
        if (typeof tab.emitFocused === 'function') {
          tab.emitFocused()
        }
      }
    } catch (err) {
      console.warn('[Workbench] Could not attach tab into container', err)
    }
  }

  private detachTerminalTab(tab: any): void {
    if (tab && typeof tab.removeFromContainer === 'function') {
      try {
        tab.removeFromContainer()
      } catch (err) {
        console.warn('[Workbench] Error detaching tab', err)
      }
    }
  }

  private collectSessions(): void {
    const tabs = this.app.tabs || []
    this.availableSessions = tabs.filter(
      (t: any) => t !== this && (t.session || t._session || t.sshSession)
    )

    if (this.embeddedTerminalTab && !tabs.includes(this.embeddedTerminalTab)) {
      this.detachTerminalTab(this.embeddedTerminalTab)
      this.embeddedTerminalTab = null
    }

    if (!this.embeddedTerminalTab && this.availableSessions.length > 0) {
      this.onSelectSession(this.availableSessions[0])
    }
  }
}
