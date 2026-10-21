import { Component, OnInit, OnDestroy, NgZone, Optional, ChangeDetectorRef, ApplicationRef } from '@angular/core'
import { AppService, ConfigService, ProfilesService, NotificationsService } from 'tabby-core'
import { Subscription } from 'rxjs'
import { ActivityTab } from './workbench-activity-bar.component'
import { DirectoryPair } from '../sftp-plus/directory-pair.model'
import { WorkbenchDialogService } from './workbench-dialog.service'
import { DEFAULT_WORKBENCH_CONFIG } from '../config/config.model'

@Component({
  selector: 'workbench-sidebar',
  template: `
    <div class="workbench-sidebar-container" [class.collapsed]="isCollapsed" [style.width.px]="isCollapsed ? 48 : 48 + drawerWidth">
      <!-- Activity Bar (48px) -->
      <workbench-activity-bar
        [activeTab]="activeView"
        (activeTabChange)="onViewChange($event)"
      ></workbench-activity-bar>

      <!-- Drawer (dynamic width) -->
      <workbench-drawer
        *ngIf="!isCollapsed"
        [drawerWidth]="drawerWidth"
        [activeTab]="activeView"
        [availableSessions]="activeSessions"
        [activeTerminalTab]="app.activeTab"
        [activeProfile]="activeProfile"
        (selectSession)="onSelectSession($event)"
        (connectProfile)="onConnectProfile($event)"
        (quickConnect)="onQuickConnect($event)"
        (applyDirectoryPair)="onApplyDirectoryPair($event)"
        (closeDrawer)="toggleCollapse()"
      ></workbench-drawer>

      <!-- Resizer Drag Handle -->
      <div
        *ngIf="!isCollapsed"
        class="sidebar-resizer"
        (mousedown)="onResizerMouseDown($event)"
        title="拖拽调节侧边栏宽度"
      ></div>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: row;
      height: 100%;
      flex-shrink: 0;
      z-index: 20;
      user-select: none;
      box-sizing: border-box;
      border-right: 1px solid #181a1f;
    }
    .workbench-sidebar-container {
      display: flex;
      flex-direction: row;
      height: 100%;
      overflow: hidden;
      background: #21252b;
      position: relative;
    }
    .workbench-sidebar-container.collapsed {
      width: 48px !important;
    }
    .sidebar-resizer {
      width: 5px;
      cursor: col-resize;
      background: transparent;
      transition: background 0.15s ease;
      height: 100%;
      flex-shrink: 0;
      user-select: none;
      z-index: 30;
      position: relative;
      margin-left: -3px;
    }
    .sidebar-resizer:hover {
      background: #1e70bf;
    }
  `],
})
export class WorkbenchSidebarComponent implements OnInit, OnDestroy {
  activeView: ActivityTab = 'sessions'
  isCollapsed = false
  drawerWidth = 300
  activeProfile: any = null
  activeSessions: any[] = []

  private subs: Subscription[] = []

  constructor(
    public app: AppService,
    private config: ConfigService,
    private zone: NgZone,
    @Optional() public cdr?: ChangeDetectorRef,
    @Optional() private profilesService?: ProfilesService,
    @Optional() private notifications?: NotificationsService,
    @Optional() private appRef?: ApplicationRef,
    @Optional() private dialogService?: WorkbenchDialogService
  ) {}

  ngOnInit(): void {
    this.drawerWidth = this.config.store?.secureWorkbench?.sidebarWidth || 300
    this.updateActiveSessions()

    this.subs.push(
      this.app.tabsChanged$.subscribe(() => {
        this.zone.run(() => {
          this.updateActiveSessions()
          this.cdr?.markForCheck()
          this.appRef?.tick()
        })
      })
    )

    this.subs.push(
      this.app.activeTabChange$.subscribe(tab => {
        this.zone.run(() => {
          this.activeProfile = (tab as any)?.profile || null
          this.cdr?.markForCheck()
          this.appRef?.tick()
        })
      })
    )
  }

  private activeResizeCleanup: (() => void) | null = null

  ngOnDestroy(): void {
    if (this.activeResizeCleanup) {
      this.activeResizeCleanup()
    }
    this.subs.forEach(s => s.unsubscribe())
    this.subs = []
  }

  onResizerMouseDown(event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startWidth = this.drawerWidth

    const cleanup = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      this.activeResizeCleanup = null
    }

    const onMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startX
      let newWidth = Math.round(startWidth + delta)
      if (newWidth < 200) newWidth = 200
      if (newWidth > 600) newWidth = 600
      this.zone.run(() => {
        this.drawerWidth = newWidth
        this.cdr?.markForCheck()
      })
    }

    const onMouseUp = () => {
      cleanup()
      if (!this.config.store.secureWorkbench) {
        this.config.store.secureWorkbench = { ...DEFAULT_WORKBENCH_CONFIG }
      }
      this.config.store.secureWorkbench.sidebarWidth = this.drawerWidth
      this.config.save()
    }

    this.activeResizeCleanup = cleanup
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  onViewChange(tab: ActivityTab): void {
    if (tab === 'settings') {
      this.dialogService?.openSettings()
      return
    }
    if (tab === 'about') {
      this.dialogService?.openAbout()
      return
    }
    if (this.activeView === tab && !this.isCollapsed) {
      this.isCollapsed = true
    } else {
      this.activeView = tab
      this.isCollapsed = false
    }
    try {
      this.cdr?.detectChanges()
      this.cdr?.markForCheck()
    } catch {}
    try {
      this.appRef?.tick()
    } catch {}
  }

  toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed
    try {
      this.cdr?.detectChanges()
      this.cdr?.markForCheck()
    } catch {}
    try {
      this.appRef?.tick()
    } catch {}
  }

  collectLeafTabs(tabs: any[]): any[] {
    const leaves: any[] = []
    for (const tab of tabs || []) {
      if (typeof tab.getAllTabs === 'function') {
        leaves.push(...this.collectLeafTabs(tab.getAllTabs()))
      } else if (Array.isArray(tab.children) && tab.children.length > 0) {
        leaves.push(...this.collectLeafTabs(tab.children))
      } else if (tab.root && typeof tab.root.getAllTabs === 'function') {
        leaves.push(...this.collectLeafTabs(tab.root.getAllTabs()))
      } else {
        leaves.push(tab)
      }
    }
    return leaves
  }

  async onSelectSession(sessionOrProfile: any): Promise<void> {
    if (!sessionOrProfile) return

    // If already an open Tab in the right workspace
    if (this.app.tabs.includes(sessionOrProfile)) {
      this.app.selectTab(sessionOrProfile)
      return
    }

    const allLeafTabs = this.collectLeafTabs(this.app.tabs || [])
    const foundLeaf = allLeafTabs.find(t => t === sessionOrProfile || t.session === sessionOrProfile?.session)
    if (foundLeaf) {
      this.app.selectTab(foundLeaf)
      return
    }

    // If it is a Profile
    const profile = sessionOrProfile.profile || sessionOrProfile
    if (profile && this.profilesService) {
      if (!profile.type && profile.options?.host) {
        profile.type = 'ssh'
      }
      // Look for already open tab matching this profile
      const existingTab = allLeafTabs.find(
        (t: any) =>
          t.profile &&
          (t.profile.id === profile.id ||
            (t.profile.options?.host && t.profile.options.host === profile.options?.host))
      )
      if (existingTab) {
        this.app.selectTab(existingTab)
        return
      }

      try {
        await this.profilesService.openNewTabForProfile(profile)
      } catch (err) {
        console.error('[Workbench] Failed to open tab for profile', err)
      }
    }
  }

  async onConnectProfile(sessionOrProfile: any): Promise<void> {
    if (!sessionOrProfile) return
    const profile = sessionOrProfile.profile || sessionOrProfile
    if (profile && this.profilesService) {
      if (!profile.type && profile.options?.host) {
        profile.type = 'ssh'
      }
      try {
        await this.profilesService.openNewTabForProfile(profile)
      } catch (err) {
        console.error('[Workbench] Failed to open tab for profile', err)
      }
    }
  }

  async onQuickConnect(event: { host: string; port: number; user: string }): Promise<void> {
    if (!this.profilesService) return
    try {
      const q = `${event.user}@${event.host}:${event.port}`
      const profile = await this.profilesService.quickConnect(q)
      if (profile) {
        await this.profilesService.openNewTabForProfile(profile)
      }
    } catch (err) {
      console.warn('[Workbench] Quick connect failed', err)
    }
  }

  onApplyDirectoryPair(pair: DirectoryPair): void {
    // Notify active SFTP+ view or broadcast
  }

  private updateActiveSessions(): void {
    const allLeafTabs = this.collectLeafTabs(this.app.tabs || [])
    this.activeSessions = allLeafTabs.filter(
      (t: any) => t.session || t._session || t.sshSession || t.frontend || t.title
    )
    if (this.app.activeTab) {
      this.activeProfile = (this.app.activeTab as any).profile || null
    }
  }
}
