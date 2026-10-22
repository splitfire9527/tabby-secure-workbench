import { Component, OnInit, OnDestroy, Optional, ChangeDetectorRef, Inject, forwardRef } from '@angular/core'
import { AppService, ConfigService, ProfilesService } from 'tabby-core'
import { Subscription } from 'rxjs'
import { WorkbenchDialogService } from './workbench-dialog.service'
import { WorkbenchHostShellService } from './workbench-host-shell.service'
import { matchProfile, parseConnectionTarget } from './workbench-drawer.component'

export interface DirectOption {
  type: 'direct' | 'profile'
  protocol: 'SSH' | 'TELNET'
  label: string
  sublabel?: string
  profile?: any
}

@Component({
  selector: 'workbench-welcome',
  template: `
    <div class="workbench-home-screen">
      <!-- Main Centered Content Container -->
      <div class="home-centered-content">
        <!-- Brand / Slogan (Subtle, clean SSH Pilot style) -->
        <div class="home-brand-row mb-4 text-center">
          <div class="d-inline-flex align-items-center gap-2">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#1e70bf" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              <polyline points="9 12 11 14 15 10"></polyline>
            </svg>
            <span class="home-title">Secure Workbench</span>
          </div>
        </div>

        <!-- Centered Quick Search / Connect Box -->
        <div class="home-search-wrapper position-relative">
          <div class="home-search-box d-flex align-items-center">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#64748b" stroke-width="2" class="search-icon ml-3 mr-2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              class="home-search-input flex-grow-1"
              placeholder="连按两次 Shift 键以搜索连接、工具或输入 SSH 命令"
              [(ngModel)]="searchQuery"
              (input)="onSearchInput()"
              (keydown)="onSearchKeyDown($event)"
              autofocus
            />
            <button
              *ngIf="searchQuery"
              class="btn-clear-search mr-2"
              (click)="clearSearch()"
              title="清除"
            >
              &times;
            </button>
          </div>

          <!-- Predictive Direct Connect & Search Dropdown (Matching media_1789896515544.png) -->
          <div *ngIf="showDropdown && dropdownOptions.length > 0" class="predictive-dropdown shadow-lg">
            <div
              *ngFor="let opt of dropdownOptions; let i = index"
              class="dropdown-option-row d-flex align-items-center justify-content-between px-3 py-2"
              [class.active]="selectedIndex === i"
              (mouseenter)="selectedIndex = i"
              (click)="executeOption(opt)"
            >
              <div class="d-flex align-items-center gap-2 text-truncate mr-2 flex-1" style="min-width: 0;">
                <span class="option-arrow">➔</span>
                <span class="option-label text-truncate">{{ opt.label }}</span>
                <span class="badge-proto font-mono" [class.badge-ssh]="opt.protocol === 'SSH'" [class.badge-telnet]="opt.protocol === 'TELNET'">
                  ({{ opt.protocol }})
                </span>
              </div>
              <div class="d-flex align-items-center gap-2 flex-shrink-0">
                <div *ngIf="opt.type === 'profile'" class="text-muted font-mono small mr-1">
                  {{ opt.sublabel }}
                </div>
                <!-- Selected Item: Folder Icon Button to Enter File Transfer (SFTP) -->
                <button
                  *ngIf="selectedIndex === i && (opt.protocol === 'SSH' || !opt.protocol)"
                  class="btn btn-xs btn-open-sftp-action d-flex align-items-center gap-1"
                  (click)="executeOption(opt, true, $event)"
                  title="进入文件传输 (SFTP) [Shift+Enter]"
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>
                  <span>传输</span>
                </button>
                <div *ngIf="selectedIndex === i" class="enter-badge font-mono">
                  ENTER ➔
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Recent Connections Section (最近) -->
        <div class="home-recent-container mt-4">
          <div class="d-flex align-items-center justify-content-between mb-2 px-1">
            <span class="recent-header-title">最近</span>
            <span *ngIf="recentProfiles.length > 0" class="text-muted small font-mono">
              {{ recentProfiles.length }} 个最近连接
            </span>
          </div>

          <!-- Recent Items List -->
          <div class="recent-items-list" *ngIf="recentProfiles.length > 0">
            <div
              *ngFor="let p of recentProfiles"
              class="recent-item-card d-flex align-items-center justify-content-between px-3 py-2"
              (click)="connectProfile(p)"
              [title]="'连接 ' + p.name"
            >
              <div class="d-flex align-items-center gap-3 text-truncate mr-2">
                <div class="item-icon-box">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                    <line x1="8" y1="21" x2="16" y2="21"></line>
                    <line x1="12" y1="17" x2="12" y2="21"></line>
                  </svg>
                </div>
                <div class="d-flex flex-column text-truncate">
                  <div class="item-name font-weight-bold text-truncate">{{ getProfileTitle(p) }}</div>
                  <div class="item-subtitle font-mono text-truncate">{{ getProfileSubtitle(p) }}</div>
                </div>
              </div>

              <div class="d-flex align-items-center gap-2">
                <span class="badge-protocol font-mono">{{ (p.type || 'SSH').toUpperCase() }}</span>
                <!-- Info button -->
                <button
                  class="btn-info-icon"
                  (click)="openProfileOptions(p); $event.stopPropagation();"
                  title="会话属性与选项"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <!-- Empty Recent Fallback -->
          <div *ngIf="recentProfiles.length === 0" class="empty-recent-card text-center py-4">
            <div class="text-muted small">暂无最近连接记录。</div>
            <div class="text-muted small mt-1">在上方搜索框输入目标地址（如 <code>root@192.168.1.100</code>）即可一键直连。</div>
          </div>
        </div>

        <!-- Bottom Footer (Shortcuts & Online Docs) -->
        <div class="home-bottom-footer mt-5 text-center">
          <div class="d-inline-flex align-items-center gap-3">
            <span class="footer-link" (click)="openQuickModal()">
              <kbd>Shift</kbd> <kbd>Shift</kbd> 快速连接
            </span>
            <span class="separator">|</span>
            <span class="footer-link" (click)="openNewSessionModal()">
              <kbd>Alt</kbd> + <kbd>N</kbd> 新建会话
            </span>
            <span class="separator">|</span>
            <span class="footer-link" (click)="openSettingsModal()">
              <kbd>Alt</kbd> + <kbd>S</kbd> 系统设置
            </span>
            <span class="separator">|</span>
            <span class="footer-link" (click)="openOnlineDocs()">
              在线文档
            </span>
          </div>
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
        height: 100%;
        background: #dfdfdf;
        color: #1e293b;
        overflow-y: auto;
        user-select: none;
        box-sizing: border-box;
      }
      .workbench-home-screen {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        width: 100%;
        min-height: 100%;
        padding: 50px 20px 40px;
        box-sizing: border-box;
      }
      .home-centered-content {
        width: 100%;
        max-width: 680px;
        display: flex;
        flex-direction: column;
      }
      .home-title {
        font-size: 20px;
        font-weight: 700;
        color: #0f172a;
        letter-spacing: 0.3px;
      }
      .home-search-wrapper {
        width: 100%;
      }
      .home-search-box {
        width: 100%;
        height: 44px;
        background: #ffffff;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
        transition: all 0.2s ease;
      }
      .home-search-box:focus-within {
        border-color: #1e70bf;
        box-shadow: 0 0 0 3px rgba(30, 112, 191, 0.18), 0 2px 10px rgba(0, 0, 0, 0.08);
      }
      .home-search-input {
        height: 100%;
        border: none;
        outline: none;
        background: transparent;
        font-size: 14px;
        color: #0f172a;
        padding-right: 12px;
      }
      .home-search-input::placeholder {
        color: #94a3b8;
        font-size: 13px;
      }
      .btn-clear-search {
        background: none;
        border: none;
        color: #94a3b8;
        font-size: 18px;
        cursor: pointer;
        line-height: 1;
        padding: 0 4px;
      }
      .btn-clear-search:hover {
        color: #0f172a;
      }

      /* Predictive Dropdown (matching media_1789896515544.png) */
      .predictive-dropdown {
        position: absolute;
        top: 48px;
        left: 0;
        right: 0;
        background: #ffffff;
        border: 1px solid #94a3b8;
        border-radius: 8px;
        z-index: 1000;
        overflow: hidden;
        animation: fadeIn 0.12s ease forwards;
      }
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-4px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .dropdown-option-row {
        cursor: pointer;
        transition: background 0.1s ease;
        border-bottom: 1px solid #f1f5f9;
        border-left: 3px solid transparent;
      }
      .dropdown-option-row:last-child {
        border-bottom: none;
      }
      .dropdown-option-row:hover,
      .dropdown-option-row.active {
        background: #e0f2fe !important;
        border-left: 3px solid #1e70bf !important;
      }
      .dropdown-option-row.active .option-label {
        color: #0c4a6e !important;
        font-weight: 700 !important;
      }
      .dropdown-option-row.active .option-arrow {
        color: #1e70bf !important;
      }
      .btn-open-sftp-action {
        background: #ffffff;
        border: 1px solid #1e70bf;
        color: #1e70bf;
        padding: 2px 7px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        line-height: 1.2;
        transition: all 0.1s ease;
      }
      .btn-open-sftp-action:hover {
        background: #1e70bf;
        color: #ffffff;
      }
      .option-arrow {
        color: #1e70bf;
        font-weight: bold;
        font-size: 14px;
      }
      .option-label {
        font-size: 13px;
        font-weight: 500;
        color: #1e293b;
      }
      .badge-proto {
        font-size: 11px;
        padding: 1px 6px;
        border-radius: 4px;
        font-weight: 700;
      }
      .badge-ssh {
        background: #e0e7ff;
        color: #3730a3;
      }
      .badge-telnet {
        background: #ecfeff;
        color: #0e7490;
      }
      .enter-badge {
        font-size: 11px;
        font-weight: 700;
        color: #1e70bf;
        background: #dbeafe;
        padding: 2px 8px;
        border-radius: 4px;
        letter-spacing: 0.5px;
      }

      /* Recent Connections */
      .recent-header-title {
        font-size: 13px;
        font-weight: 700;
        color: #475569;
        letter-spacing: 0.3px;
      }
      .recent-items-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .recent-item-card {
        background: #ffffff;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.15s ease;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
      }
      .recent-item-card:hover {
        background: #f8fafc;
        border-color: #94a3b8;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
      }
      .item-icon-box {
        width: 30px;
        height: 30px;
        border-radius: 6px;
        background: #eff6ff;
        color: #1e70bf;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .item-name {
        font-size: 13px;
        color: #0f172a;
      }
      .item-subtitle {
        font-size: 11px;
        color: #64748b;
        margin-top: 1px;
      }
      .badge-protocol {
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 4px;
        background: #f1f5f9;
        color: #475569;
        border: 1px solid #e2e8f0;
        font-weight: 600;
      }
      .btn-info-icon {
        background: none;
        border: none;
        color: #94a3b8;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.12s ease;
      }
      .btn-info-icon:hover {
        background: #e2e8f0;
        color: #0f172a;
      }
      .empty-recent-card {
        background: #ffffff;
        border: 1px dashed #cbd5e1;
        border-radius: 6px;
      }

      /* Bottom Footer */
      .home-bottom-footer {
        font-size: 12px;
        color: #64748b;
      }
      .footer-link {
        cursor: pointer;
        transition: color 0.12s ease;
      }
      .footer-link:hover {
        color: #0f172a;
      }
      .footer-link kbd {
        background: #ffffff;
        border: 1px solid #cbd5e1;
        box-shadow: 0 1px 1px rgba(0, 0, 0, 0.06);
        color: #334155;
        font-size: 11px;
        padding: 1px 5px;
        border-radius: 4px;
      }
      .separator {
        color: #cbd5e1;
      }
    `,
  ],
})
export class WorkbenchWelcomeComponent implements OnInit, OnDestroy {
  searchQuery = ''
  showDropdown = false
  selectedIndex = 0
  dropdownOptions: DirectOption[] = []
  profiles: any[] = []
  recentProfileIds: string[] = []

  private subs: Subscription[] = []

  constructor(
    public app: AppService,
    private config: ConfigService,
    private cdr: ChangeDetectorRef,
    @Optional() private profilesService?: ProfilesService,
    @Optional() private dialogService?: WorkbenchDialogService,
    @Optional() @Inject(forwardRef(() => WorkbenchHostShellService)) private hostShell?: WorkbenchHostShellService
  ) {}

  ngOnInit(): void {
    this.loadRecentIds()
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
    this.subs.forEach((s) => s.unsubscribe())
  }

  private loadRecentIds(): void {
    try {
      const stored = localStorage.getItem('tabby_workbench_recent_ids')
      if (stored) {
        this.recentProfileIds = JSON.parse(stored)
      }
    } catch {}
  }

  loadProfiles(): void {
    if (this.profilesService) {
      this.profilesService.getProfiles().then((p) => {
        this.profiles = (p || []).filter((item: any) => item.type !== 'workbench')
        this.cdr.detectChanges()
      })
    } else {
      this.profiles = ((this.config.store?.profiles || []) as any[]).filter(
        (item: any) => item.type !== 'workbench'
      )
    }
  }

  get recentProfiles(): any[] {
    if (this.recentProfileIds.length > 0) {
      const map = new Map(this.profiles.map((p) => [p.id, p]))
      const list: any[] = []
      for (const id of this.recentProfileIds) {
        if (map.has(id)) list.push(map.get(id))
      }
      if (list.length > 0) return list
    }
    // Fallback to first 4 non-builtin profiles
    return this.profiles.filter((p) => !this.isBuiltin(p)).slice(0, 4)
  }

  isBuiltin(p: any): boolean {
    if (!p) return false
    if (p.isBuiltin || p.isTemplate) return true
    if (p.type === 'local' || (typeof p.id === 'string' && p.id.startsWith('local:'))) return true
    return false
  }

  getProfileTitle(p: any): string {
    if (!p) return '未命名会话'
    return p.name || p.options?.host || '未命名会话'
  }

  getProfileSubtitle(p: any): string {
    if (!p) return ''
    if (p.options?.host) {
      const user = p.options.user || 'root'
      const port = p.options.port || 22
      return `${user}@${p.options.host}:${port}`
    }
    if (p.options?.command) {
      return p.options.command
    }
    return p.type || 'terminal'
  }

  onSearchInput(): void {
    const q = this.searchQuery.trim()
    if (!q) {
      this.showDropdown = false
      this.dropdownOptions = []
      return
    }

    const options: DirectOption[] = []

    // 1. Matching existing profiles first! (已有的会话要在前边)
    const matches = this.profiles.filter((p) => matchProfile(p, q))
    for (const m of matches.slice(0, 5)) {
      options.push({
        type: 'profile',
        protocol: (m.type || 'SSH').toUpperCase() as any,
        label: m.name || m.options?.host,
        sublabel: this.getProfileSubtitle(m),
        profile: m,
      })
    }

    // 2. Direct connect options (SSH & TELNET)
    options.push({
      type: 'direct',
      protocol: 'SSH',
      label: `正在连接到 "${q}"...`,
    })
    options.push({
      type: 'direct',
      protocol: 'TELNET',
      label: `正在连接到 "${q}"...`,
    })

    this.dropdownOptions = options
    this.selectedIndex = 0
    this.showDropdown = true
  }

  onSearchKeyDown(event: KeyboardEvent): void {
    if (!this.showDropdown || this.dropdownOptions.length === 0) {
      if (event.key === 'Enter') {
        event.preventDefault()
        this.onSearchInput()
        if (this.dropdownOptions.length > 0) {
          this.executeOption(this.dropdownOptions[0], event.shiftKey)
        }
      }
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      this.selectedIndex = (this.selectedIndex + 1) % this.dropdownOptions.length
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      this.selectedIndex = (this.selectedIndex - 1 + this.dropdownOptions.length) % this.dropdownOptions.length
    } else if (event.key === 'Enter') {
      event.preventDefault()
      this.executeOption(this.dropdownOptions[this.selectedIndex], event.shiftKey)
    } else if (event.key === 'Escape') {
      this.showDropdown = false
    }
  }

  clearSearch(): void {
    this.searchQuery = ''
    this.showDropdown = false
    this.dropdownOptions = []
  }

  async executeOption(opt: DirectOption, openSftp = false, event?: MouseEvent): Promise<void> {
    if (event) {
      event.preventDefault()
      event.stopPropagation()
    }
    this.showDropdown = false
    if (this.hostShell) {
      this.hostShell.toggleHome(false)
    }

    if (opt.type === 'profile' && opt.profile) {
      await this.connectProfile(opt.profile, openSftp)
      this.clearSearch()
      return
    }

    // Direct connect mode
    const rawTarget = this.searchQuery.trim()
    this.clearSearch()
    if (!rawTarget) return

    await this.performDirectConnect(rawTarget, opt.protocol, openSftp)
  }

  async performDirectConnect(target: string, protocol: 'SSH' | 'TELNET', openSftp = false): Promise<void> {
    if (this.profilesService) {
      try {
        let profile: any = null
        if (protocol === 'TELNET') {
          const { host, port } = parseConnectionTarget(target)
          profile = {
            name: target,
            type: 'telnet',
            options: {
              host,
              port: port === 22 ? 23 : port,
            },
          }
        } else {
          // SSH
          try {
            profile = await this.profilesService.quickConnect(target)
          } catch {
            profile = null
          }
          if (!profile) {
            const { user, host, port } = parseConnectionTarget(target)
            if (host) {
              profile = {
                name: target,
                type: 'ssh',
                options: {
                  host,
                  port: port || 22,
                  ...(user ? { user } : {}),
                },
              }
            }
          }
        }

        if (profile) {
          const tab = await this.profilesService.openNewTabForProfile(profile)
          if (openSftp && typeof (tab as any)?.__openSftpPreferred === 'function') {
            ;(tab as any).__openSftpPreferred()
          }
        }
      } catch (err) {
        console.warn('[Workbench] Direct connect failed', err)
      }
    }
  }

  private isConnectingProfile = false

  async connectProfile(profile: any, openSftp = false): Promise<void> {
    if (!profile || this.isConnectingProfile) return
    this.isConnectingProfile = true
    this.addRecentProfile(profile.id)
    if (this.hostShell) {
      this.hostShell.toggleHome(false)
    }
    if (this.profilesService) {
      try {
        const tab = await this.profilesService.openNewTabForProfile(profile)
        if (openSftp && typeof (tab as any)?.__openSftpPreferred === 'function') {
          ;(tab as any).__openSftpPreferred()
        }
      } catch (err) {
        console.error('[Workbench] Failed to open profile', err)
      } finally {
        setTimeout(() => {
          this.isConnectingProfile = false
        }, 500)
      }
    } else {
      this.isConnectingProfile = false
    }
  }

  private addRecentProfile(id: string): void {
    if (!id) return
    this.recentProfileIds = [id, ...this.recentProfileIds.filter((i) => i !== id)].slice(0, 10)
    try {
      localStorage.setItem('tabby_workbench_recent_ids', JSON.stringify(this.recentProfileIds))
    } catch {}
  }

  openProfileOptions(profile: any): void {
    if (this.dialogService && profile) {
      this.dialogService.openSessionOptions(profile)
    }
  }

  openNewSessionModal(): void {
    if (this.dialogService) {
      this.dialogService.openNewSession()
    }
  }

  openSettingsModal(): void {
    if (this.dialogService) {
      this.dialogService.openSettings()
    }
  }

  openQuickModal(): void {
    if (this.hostShell) {
      this.hostShell.openQuickSearch()
    }
  }

  openOnlineDocs(): void {
    if (typeof window !== 'undefined') {
      window.open('https://github.com/splitfire9527/tabby-secure-workbench', '_blank')
    }
  }
}
