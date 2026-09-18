import { Component, OnInit, OnDestroy, NgZone, Optional, ChangeDetectorRef } from '@angular/core'
import { AppService, ConfigService, ProfilesService, NotificationsService } from 'tabby-core'
import { Subscription } from 'rxjs'
import { ActivityTab } from './workbench-activity-bar.component'
import { DirectoryPair } from '../sftp-plus/directory-pair.model'

@Component({
  selector: 'workbench-sidebar',
  template: `
    <div class="workbench-sidebar-container" [class.collapsed]="isCollapsed">
      <!-- Activity Bar (48px) -->
      <workbench-activity-bar
        [activeTab]="activeView"
        (tabChange)="onViewChange($event)"
      ></workbench-activity-bar>

      <!-- Drawer (260px) -->
      <workbench-drawer
        *ngIf="!isCollapsed"
        [activeTab]="activeView"
        [availableSessions]="activeSessions"
        [activeTerminalTab]="app.activeTab"
        [activeProfile]="activeProfile"
        (selectSession)="onSelectSession($event)"
        (quickConnect)="onQuickConnect($event)"
        (applyDirectoryPair)="onApplyDirectoryPair($event)"
        (closeDrawer)="toggleCollapse()"
      ></workbench-drawer>
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
      width: 308px;
      transition: width 0.15s ease;
      overflow: hidden;
      background: #21252b;
    }
    .workbench-sidebar-container.collapsed {
      width: 48px;
    }
  `],
})
export class WorkbenchSidebarComponent implements OnInit, OnDestroy {
  activeView: ActivityTab = 'sessions'
  isCollapsed = false
  activeProfile: any = null
  activeSessions: any[] = []

  private subs: Subscription[] = []

  constructor(
    public app: AppService,
    private config: ConfigService,
    private zone: NgZone,
    private cdr: ChangeDetectorRef,
    @Optional() private profilesService?: ProfilesService,
    @Optional() private notifications?: NotificationsService
  ) {}

  ngOnInit(): void {
    this.updateActiveSessions()

    this.subs.push(
      this.app.tabsChanged$.subscribe(() => {
        this.zone.run(() => {
          this.updateActiveSessions()
          this.cdr.markForCheck()
        })
      })
    )

    this.subs.push(
      this.app.activeTabChange$.subscribe(tab => {
        this.zone.run(() => {
          this.activeProfile = (tab as any)?.profile || null
          this.cdr.markForCheck()
        })
      })
    )
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe())
    this.subs = []
  }

  onViewChange(tab: ActivityTab): void {
    if (this.activeView === tab && !this.isCollapsed) {
      this.isCollapsed = true
    } else {
      this.activeView = tab
      this.isCollapsed = false
    }
    this.cdr.markForCheck()
  }

  toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed
    this.cdr.markForCheck()
  }

  async onSelectSession(sessionOrProfile: any): Promise<void> {
    if (!sessionOrProfile) return

    // If already an open Tab in the right workspace
    if (this.app.tabs.includes(sessionOrProfile)) {
      this.app.selectTab(sessionOrProfile)
      return
    }

    // If it is a Profile
    const profile = sessionOrProfile.profile || sessionOrProfile
    if (profile && this.profilesService) {
      // Look for already open tab matching this profile
      const existingTab = this.app.tabs.find(
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
    this.activeSessions = (this.app.tabs || []).filter(
      (t: any) => t.session || t._session || t.sshSession || t.frontend
    )
    if (this.app.activeTab) {
      this.activeProfile = (this.app.activeTab as any).profile || null
    }
  }
}
