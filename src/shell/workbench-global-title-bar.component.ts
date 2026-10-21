import { Component, OnInit, OnDestroy, ChangeDetectorRef, Optional, Inject, forwardRef } from '@angular/core'
import { AppService, HostWindowService, ConfigService } from 'tabby-core'
import { SettingsTabComponent } from 'tabby-settings'
import { Subscription } from 'rxjs'
import { throttleTime } from 'rxjs/operators'
import { WorkbenchDialogService } from './workbench-dialog.service'
import { WorkbenchHostShellService } from './workbench-host-shell.service'

@Component({
  selector: 'workbench-global-title-bar',
  template: `
    <div class="title-bar-drag-region">
      <!-- Center: Active Session Title (Clean, Centered) -->
      <div class="title-bar-center text-truncate">
        <span class="window-title text-truncate">{{ displayTitle }}</span>
      </div>

      <!-- Right: Window Controls -->
      <div class="title-bar-right no-drag">
        <div class="window-controls-group">
          <button class="win-ctl-btn win-min" (click)="minimize()" title="最小化">
            <svg viewBox="0 0 10 1" width="10" height="1" class="ctl-svg-min"><rect width="10" height="1" fill="currentColor"/></svg>
          </button>
          <button class="win-ctl-btn win-max" (click)="toggleMaximize()" title="最大化 / 还原">
            <svg viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.2" class="ctl-svg-max">
              <rect x="0.6" y="0.6" width="8.8" height="8.8"/>
            </svg>
          </button>
          <button class="win-ctl-btn win-close" (click)="close()" title="关闭">
            <svg viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.2" class="ctl-svg-close">
              <line x1="1" y1="1" x2="9" y2="9"/>
              <line x1="9" y1="1" x2="1" y2="9"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 30px;
        min-height: 30px;
        max-height: 30px;
        box-sizing: border-box;
        background: #f0f2f5;
        border-bottom: 1px solid #d0d4dc;
        color: #222222;
        user-select: none;
        z-index: 100;
        flex-shrink: 0;
        position: relative;
      }
      .title-bar-drag-region {
        display: flex;
        align-items: center;
        justify-content: space-between;
        height: 100%;
        width: 100%;
        padding: 0 4px 0 10px;
        -webkit-app-region: drag;
        box-sizing: border-box;
        position: relative;
      }
      .title-bar-left {
        min-width: 32px;
        width: auto;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .title-bar-center {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        display: flex;
        align-items: center;
        gap: 8px;
        max-width: 65%;
        pointer-events: none;
      }
      .window-title {
        font-size: 14px;
        font-weight: 600;
        color: #222222;
        letter-spacing: 0.2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      /* Connection Status Chart (Signal Bars) */
      .connection-chart {
        display: inline-flex;
        align-items: flex-end;
        gap: 2px;
        height: 12px;
        flex-shrink: 0;
        padding-bottom: 1px;
      }
      .connection-chart .bar {
        width: 2.5px;
        border-radius: 0.5px;
        background: #27ae60;
        transition: height 0.2s ease, background-color 0.2s ease;
      }
      .connection-chart .bar-1 { height: 3px; }
      .connection-chart .bar-2 { height: 6px; }
      .connection-chart .bar-3 { height: 9px; }
      .connection-chart .bar-4 { height: 12px; }

      .connection-chart.connecting .bar {
        background: #2980b9;
        animation: chartPulse 1s infinite alternate;
      }
      .connection-chart.connecting .bar-2 { animation-delay: 0.2s; }
      .connection-chart.connecting .bar-3 { animation-delay: 0.4s; }
      .connection-chart.connecting .bar-4 { animation-delay: 0.6s; }

      .connection-chart.disconnected .bar {
        background: #c0392b;
        opacity: 0.4;
      }

      @keyframes chartPulse {
        0% { opacity: 0.3; }
        100% { opacity: 1; }
      }

      .status-badge {
        font-size: 9px;
        padding: 1px 5px;
        border-radius: 3px;
        font-weight: 700;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        flex-shrink: 0;
      }
      .status-badge.connected {
        background: rgba(39, 174, 96, 0.15);
        color: #27ae60;
        border: 1px solid rgba(39, 174, 96, 0.35);
      }
      .status-badge.connecting {
        background: rgba(41, 128, 185, 0.15);
        color: #2980b9;
        border: 1px solid rgba(41, 128, 185, 0.35);
      }
      .status-badge.disconnected {
        background: rgba(192, 57, 43, 0.15);
        color: #c0392b;
        border: 1px solid rgba(192, 57, 43, 0.35);
      }
      .title-bar-right {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
        margin-left: auto;
      }
      .no-drag {
        -webkit-app-region: no-drag;
      }
      .title-btn {
        background: transparent;
        border: none;
        color: #333333;
        width: 26px;
        height: 24px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 3px;
        cursor: pointer;
        transition: background 0.1s ease;
      }
      .title-btn:hover {
        background: rgba(0, 0, 0, 0.08);
      }
      .window-controls-group {
        display: flex;
        align-items: center;
        height: 30px;
      }
      .win-ctl-btn {
        background: transparent;
        border: none;
        color: #333333;
        width: 38px;
        height: 30px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background 0.1s ease;
      }
      .win-ctl-btn:hover {
        background: rgba(0, 0, 0, 0.08);
      }
      .win-ctl-btn.win-close:hover {
        background: #e81123 !important;
        color: #ffffff !important;
      }

      /* Lock SVG dimensions strictly to prevent maximize/restore distortion */
      svg {
        flex-shrink: 0 !important;
        display: inline-block !important;
      }
      .icon-svg {
        width: 13px !important;
        height: 13px !important;
        max-width: 13px !important;
        max-height: 13px !important;
      }
      .ctl-svg-min {
        width: 10px !important;
        height: 1px !important;
        max-width: 10px !important;
        max-height: 1px !important;
      }
      .ctl-svg-max {
        width: 9px !important;
        height: 9px !important;
        max-width: 9px !important;
        max-height: 9px !important;
      }
      .ctl-svg-close {
        width: 9px !important;
        height: 9px !important;
        max-width: 9px !important;
        max-height: 9px !important;
      }
    `,
  ],
})
export class WorkbenchGlobalTitleBarComponent implements OnInit, OnDestroy {
  private subs: Subscription[] = []
  private sessionSubs: Subscription[] = []

  constructor(
    public app: AppService,
    private hostWindow: HostWindowService,
    private config: ConfigService,
    private cdr: ChangeDetectorRef,
    @Optional() @Inject(forwardRef(() => WorkbenchHostShellService)) private hostShell?: WorkbenchHostShellService,
    @Optional() private dialogService?: WorkbenchDialogService
  ) {}

  ngOnInit(): void {
    if (this.app.activeTabChange$) {
      this.subs.push(
        this.app.activeTabChange$.subscribe(() => {
          this.trackActiveTabSession()
          this.syncTabHeaders()
          this.cdr.detectChanges()
        })
      )
    }
    if (this.app.tabOpened$) {
      this.subs.push(
        this.app.tabOpened$.subscribe(() => {
          this.trackActiveTabSession()
          this.syncTabHeaders()
          this.cdr.detectChanges()
        })
      )
    }
    if (this.app.tabClosed$) {
      this.subs.push(
        this.app.tabClosed$.subscribe(() => {
          this.trackActiveTabSession()
          this.syncTabHeaders()
          this.cdr.detectChanges()
        })
      )
    }
    if (this.app.tabsChanged$) {
      this.subs.push(
        this.app.tabsChanged$.subscribe(() => {
          this.syncTabHeaders()
          this.cdr.detectChanges()
        })
      )
    }

    this.trackActiveTabSession()
    this.syncTabHeaders()
    this.updateMaximizedState()
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.onWindowResize)
    }
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.onWindowResize)
    }
    this.subs.forEach((s) => s.unsubscribe())
    this.sessionSubs.forEach((s) => s.unsubscribe())
  }

  private trackActiveTabSession(): void {
    this.sessionSubs.forEach((s) => s.unsubscribe())
    this.sessionSubs = []

    let tab = this.activeTab
    if (typeof tab?.getFocusedTab === 'function') {
      tab = tab.getFocusedTab() || tab
    }
    if (!tab) return

    const attachSession = (sess: any) => {
      if (!sess) return
      if (sess.output$) {
        this.sessionSubs.push(
          sess.output$.pipe(throttleTime(500)).subscribe(() => {
            this.syncTabHeaders()
            this.cdr.detectChanges()
          })
        )
      }
      if (sess.binaryOutput$) {
        this.sessionSubs.push(
          sess.binaryOutput$.pipe(throttleTime(500)).subscribe(() => {
            this.syncTabHeaders()
            this.cdr.detectChanges()
          })
        )
      }
      if (sess.closed$) {
        this.sessionSubs.push(
          sess.closed$.subscribe(() => {
            this.syncTabHeaders()
            this.cdr.detectChanges()
          })
        )
      }
      if (sess.destroyed$) {
        this.sessionSubs.push(
          sess.destroyed$.subscribe(() => {
            this.syncTabHeaders()
            this.cdr.detectChanges()
          })
        )
      }
    }

    if (tab.sessionChanged$) {
      this.sessionSubs.push(
        tab.sessionChanged$.subscribe((s: any) => {
          attachSession(s)
          this.syncTabHeaders()
          this.cdr.detectChanges()
        })
      )
    }

    const currentSession =
      tab.session ||
      tab._session ||
      tab.sshSession ||
      (Array.isArray(tab.children) ? tab.children[0]?.session : null)
    attachSession(currentSession)
  }

  syncTabHeaders(): void {
    if (typeof document === 'undefined') return
    setTimeout(() => {
      const headers = Array.from(document.querySelectorAll('tab-header'))
      for (let i = 0; i < this.app.tabs.length && i < headers.length; i++) {
        let tab: any = this.app.tabs[i]
        if (typeof tab.getFocusedTab === 'function') {
          tab = tab.getFocusedTab() || tab
        }
        const session = tab.session || tab._session || tab.sshSession
        const isOpen = session ? session.open === true : false
        const isConnecting = session && !isOpen && !session.closed && !session.destroyed
        headers[i].setAttribute('data-connection-state', isOpen ? 'connected' : (isConnecting ? 'connecting' : 'disconnected'))
      }
    }, 50)
  }

  get activeTab(): any {
    return this.app.activeTab
  }

  get hasActiveSession(): boolean {
    if (!this.activeTab) return false
    if (this.activeTab.session || this.activeTab._session || this.activeTab.frontend) return true
    if (typeof this.activeTab.getFocusedTab === 'function') {
      const child = this.activeTab.getFocusedTab()
      if (child && (child.session || child._session || child.frontend)) return true
    }
    if (Array.isArray(this.activeTab.children) && this.activeTab.children.length > 0) {
      return true
    }
    return this.displayTitle !== 'Secure Workbench'
  }

  get displayTitle(): string {
    if (!this.activeTab) {
      return 'Secure Workbench'
    }
    const title =
      this.activeTab.title ||
      this.activeTab.customTitle ||
      this.activeTab.profile?.name
    const user =
      this.activeTab.profile?.options?.user ||
      this.activeTab.profile?.options?.username
    const host = this.activeTab.profile?.options?.host
    const port = this.activeTab.profile?.options?.port || 22

    if (host && user) {
      return `${title || host} - ${user}@${host}:${port}`
    }
    if (title) {
      return title
    }
    return 'Secure Workbench'
  }

  get connectionState(): 'Connected' | 'Disconnected' | 'Connecting' {
    if (!this.hasActiveSession) return 'Disconnected'
    let tab = this.activeTab
    if (typeof tab?.getFocusedTab === 'function') {
      tab = tab.getFocusedTab() || tab
    }
    const session =
      tab?.session ||
      tab?._session ||
      tab?.sshSession ||
      (Array.isArray(tab?.children) ? tab.children[0]?.session : null)

    if (!session || session.open === false) {
      return 'Disconnected'
    }
    return 'Connected'
  }

  openSettings(): void {
    if (this.dialogService) {
      this.dialogService.openSettings()
    } else {
      try {
        this.app.openNewTab({ type: SettingsTabComponent } as any)
      } catch {
        const btn = document.querySelector(
          'div.btn-group.background > button[title*="Settings"], button[title*="配置"], button[title*="设置"]'
        ) as HTMLElement
        if (btn) btn.click()
      }
    }
  }

  private onWindowResize = () => {
    this.updateMaximizedState()
  }

  updateMaximizedState(): void {
    try {
      const isMax = this.hostWindow ? this.hostWindow.isMaximized() : false
      const winEl = document.querySelector('.window.workbench-shell-active')
      if (winEl) {
        if (isMax) {
          winEl.classList.add('window-maximized')
        } else {
          winEl.classList.remove('window-maximized')
        }
      }
    } catch {}
  }

  minimize(): void {
    this.hostWindow.minimize()
  }

  toggleMaximize(): void {
    this.hostWindow.toggleMaximize()
    setTimeout(() => this.updateMaximizedState(), 100)
    setTimeout(() => this.updateMaximizedState(), 300)
  }

  close(): void {
    this.hostWindow.close()
  }
}
