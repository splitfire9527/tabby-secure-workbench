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

        <!-- Workspace Viewport -->
        <div class="workbench-workspace">
          <!-- PTY Terminal View -->
          <div
            class="terminal-pane"
            [style.display]="viewMode === 'pty' ? 'block' : 'none'"
            style="width: 100%; height: 100%; position: relative;"
          >
            <ng-container #terminalHost></ng-container>
            <div *ngIf="!embeddedTerminalTab" class="d-flex align-items-center justify-content-center h-100 text-muted">
              <div class="text-center">
                <h6>No active terminal in this Workbench Tab</h6>
                <button class="btn btn-sm btn-primary mt-2" (click)="launchDefaultTerminal()">
                  Open Terminal
                </button>
              </div>
            </div>
          </div>

          <!-- SFTP+ Overlay View -->
          <div
            class="sftp-pane p-3"
            [style.display]="viewMode === 'sftp' ? 'block' : 'none'"
            style="overflow-y: auto;"
          >
            <div class="d-flex justify-content-between align-items-center mb-3">
              <h5 class="m-0 text-white font-weight-bold">SFTP+ Dual-Pane File Manager</h5>
              <div class="d-flex align-items-center">
                <button
                  *ngIf="clipboard.hasItem()"
                  class="btn btn-sm btn-outline-info mr-2"
                  (click)="pasteFromOtherConnection()"
                  title="Paste file copied from another remote connection"
                >
                  &#x1f4cb; Remote Paste (from other host)
                </button>
                <button class="btn btn-sm btn-outline-secondary" (click)="viewMode = 'pty'">
                  &larr; Back to Terminal
                </button>
              </div>
            </div>

            <!-- Dual-Pane mock/view representation -->
            <div class="row" style="height: calc(100% - 60px);">
              <!-- Local Pane -->
              <div class="col-6 h-100">
                <div class="card h-100 border-secondary">
                  <div class="card-header py-2 font-weight-bold small bg-dark d-flex justify-content-between align-items-center">
                    <span>💻 Local: {{ localCurrentPath }}</span>
                    <button class="btn btn-xs btn-outline-secondary py-0" (click)="refreshLocal()">Refresh</button>
                  </div>
                  <div class="card-body p-2" style="overflow-y: auto;">
                    <div class="text-muted small">Local filesystem view ready</div>
                  </div>
                </div>
              </div>

              <!-- Remote Pane -->
              <div class="col-6 h-100">
                <div class="card h-100 border-secondary">
                  <div class="card-header py-2 font-weight-bold small bg-dark d-flex justify-content-between align-items-center">
                    <span>📁 Remote: {{ remoteCurrentPath }}</span>
                    <div>
                      <button
                        *ngIf="clipboard.hasItem()"
                        class="btn btn-xs btn-info py-0 mr-1"
                        (click)="pasteFromOtherConnection()"
                      >
                        Remote Paste
                      </button>
                      <button class="btn btn-xs btn-outline-secondary py-0" (click)="refreshRemote()">Refresh</button>
                    </div>
                  </div>
                  <div class="card-body p-2" style="overflow-y: auto;">
                    <div class="text-muted small">Remote SFTP session ready</div>
                  </div>
                </div>
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
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
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
