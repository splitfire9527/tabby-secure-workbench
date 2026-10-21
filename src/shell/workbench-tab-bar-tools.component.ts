import { Component, Optional, Inject, forwardRef } from '@angular/core'
import { AppService, ProfilesService } from 'tabby-core'
import { WorkbenchHostShellService } from './workbench-host-shell.service'

@Component({
  selector: 'workbench-tab-bar-tools',
  template: `
    <div class="tab-bar-tools-container">
      <!-- 1. Home Button -->
      <button
        class="tab-tool-btn"
        [class.active]="isHomeActive"
        (click)="onHomeClick()"
        title="主页 (Home)"
        aria-label="主页"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
      </button>

      <!-- 2. Local Terminal Button -->
      <button
        class="tab-tool-btn"
        (click)="openLocalTerminal()"
        title="新建本地终端 (Local Terminal)"
        aria-label="新建本地终端"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="4 17 10 11 4 5"></polyline>
          <line x1="12" y1="19" x2="20" y2="19"></line>
        </svg>
      </button>
    </div>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        height: 34px;
        flex-shrink: 0;
        z-index: 10;
      }
      .tab-bar-tools-container {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        height: 100%;
        padding: 0 6px 0 6px;
        background: #dfdfdf;
        border-right: 1px solid #d0d4dc;
        box-sizing: border-box;
      }
      .tab-tool-btn {
        width: 30px;
        height: 26px;
        border: 1px solid transparent;
        border-radius: 4px;
        background: transparent;
        color: #475569;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.15s ease;
        padding: 0;
        outline: none;
      }
      .tab-tool-btn:hover {
        background: #e4e7eb;
        border-color: #cbd5e1;
        color: #0f172a;
      }
      .tab-tool-btn.active {
        background: #ffffff !important;
        border-color: #cbd5e1 !important;
        color: #1e70bf !important;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
      }
      .tab-tool-btn svg {
        width: 15px !important;
        height: 15px !important;
        flex-shrink: 0;
      }
    `,
  ],
})
export class WorkbenchTabBarToolsComponent {
  constructor(
    public app: AppService,
    @Optional() private profilesService?: ProfilesService,
    @Optional() @Inject(forwardRef(() => WorkbenchHostShellService)) private hostShell?: WorkbenchHostShellService
  ) {}

  get isHomeActive(): boolean {
    return this.hostShell ? this.hostShell.isHomeActive : false
  }

  onHomeClick(): void {
    if (this.hostShell) {
      this.hostShell.toggleHome(true)
    }
  }

  async openLocalTerminal(): Promise<void> {
    if (this.hostShell) {
      this.hostShell.toggleHome(false)
    }
    if (this.profilesService) {
      try {
        const profiles = await this.profilesService.getProfiles()
        const localProfile = profiles.find(
          (p: any) => p.type === 'local' || (typeof p.id === 'string' && p.id.startsWith('local:'))
        )
        if (localProfile) {
          await this.profilesService.openNewTabForProfile(localProfile)
          return
        }
        const p = await this.profilesService.quickConnect('local')
        if (p) {
          await this.profilesService.openNewTabForProfile(p)
          return
        }
      } catch (err) {
        console.warn('[Workbench] Error opening local terminal', err)
      }
    }
    try {
      (this.app as any).openNewTab?.()
    } catch {}
  }
}
