import { Component, OnInit, OnDestroy, HostListener, Optional, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core'
import { AppService, ConfigService, ProfilesService } from 'tabby-core'
import { Subscription } from 'rxjs'
import { DirectOption } from './workbench-welcome.component'
import { matchProfile, parseConnectionTarget } from './workbench-drawer.component'

@Component({
  selector: 'workbench-quick-search-modal',
  template: `
    <div
      *ngIf="isOpen"
      class="quick-search-backdrop"
      (click)="close()"
    >
      <div class="quick-search-dialog shadow-lg" (click)="$event.stopPropagation()">
        <!-- Search Input Box -->
        <div class="quick-search-input-box d-flex align-items-center">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#64748b" stroke-width="2" class="search-icon ml-3 mr-2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            #quickInput
            type="text"
            class="quick-input flex-grow-1"
            placeholder="输入目标地址 (user@host) 或会话名称以快速连接..."
            [(ngModel)]="searchQuery"
            (input)="onSearchInput()"
            (keydown)="onKeyDown($event)"
            autofocus
          />
          <button
            *ngIf="searchQuery"
            class="btn-clear mr-2"
            (click)="clearSearch()"
          >
            &times;
          </button>
        </div>

        <!-- Predictive Dropdown Options: Existing Profiles First, Selected Item Folder Button -->
        <div *ngIf="dropdownOptions.length > 0" class="quick-dropdown-list">
          <div
            *ngFor="let opt of dropdownOptions; let i = index"
            class="quick-option-row d-flex align-items-center justify-content-between px-3 py-2"
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

        <!-- Bottom Tip Bar -->
        <div class="quick-footer d-flex align-items-center justify-content-between px-3 py-2 border-top">
          <div class="d-flex align-items-center gap-2 text-muted small">
            <span>支持 SSH / Telnet 直连</span>
            <span>·</span>
            <span>按 <kbd>Enter</kbd> 连接</span>
            <span>·</span>
            <span>按 <kbd>Shift + Enter</kbd> 文件传输</span>
            <span>·</span>
            <span>按 <kbd>Esc</kbd> 退出</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .quick-search-backdrop {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        background: rgba(0, 0, 0, 0.45) !important;
        display: flex !important;
        align-items: flex-start !important;
        justify-content: center !important;
        padding-top: 15vh !important;
        z-index: 60000 !important;
        user-select: none !important;
      }
      .quick-search-dialog {
        width: 620px;
        max-width: 92vw;
        background: #ffffff;
        border: 1px solid #94a3b8;
        border-radius: 8px;
        overflow: hidden;
        animation: slideDown 0.15s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes slideDown {
        from { opacity: 0; transform: translateY(-12px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .quick-search-input-box {
        height: 48px;
        background: #ffffff;
      }
      .quick-input {
        height: 100%;
        border: none;
        outline: none;
        font-size: 15px;
        color: #0f172a;
        background: transparent;
        padding-right: 10px;
      }
      .quick-input::placeholder {
        color: #94a3b8;
        font-size: 13px;
      }
      .btn-clear {
        background: none;
        border: none;
        color: #94a3b8;
        font-size: 20px;
        cursor: pointer;
        padding: 0 4px;
        line-height: 1;
      }
      .btn-clear:hover {
        color: #0f172a;
      }
      .quick-dropdown-list {
        max-height: 280px;
        overflow-y: auto;
        border-top: 1px solid #e2e8f0;
      }
      .quick-option-row {
        cursor: pointer;
        transition: background 0.1s ease;
        border-bottom: 1px solid #f1f5f9;
        border-left: 3px solid transparent;
      }
      .quick-option-row:last-child {
        border-bottom: none;
      }
      .quick-option-row:hover,
      .quick-option-row.active {
        background: #e0f2fe !important;
        border-left: 3px solid #1e70bf !important;
      }
      .quick-option-row.active .option-label {
        color: #0c4a6e !important;
        font-weight: 700 !important;
      }
      .quick-option-row.active .option-arrow {
        color: #1e70bf !important;
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
      .enter-badge {
        font-size: 11px;
        font-weight: 700;
        color: #1e70bf;
        background: #dbeafe;
        padding: 2px 8px;
        border-radius: 4px;
        letter-spacing: 0.5px;
      }
      .quick-footer {
        background: #f8fafc;
        border-color: #e2e8f0 !important;
      }
      .quick-footer kbd {
        background: #ffffff;
        border: 1px solid #cbd5e1;
        color: #334155;
        font-size: 11px;
        padding: 1px 4px;
        border-radius: 3px;
      }
    `,
  ],
})
export class WorkbenchQuickSearchModalComponent implements OnInit, OnDestroy {
  isOpen = false
  searchQuery = ''
  selectedIndex = 0
  dropdownOptions: DirectOption[] = []
  profiles: any[] = []

  @ViewChild('quickInput') quickInputRef?: ElementRef<HTMLInputElement>
  private lastShiftPressTime = 0
  private subs: Subscription[] = []
  private focusTimer?: any

  constructor(
    public app: AppService,
    private config: ConfigService,
    private cdr: ChangeDetectorRef,
    @Optional() private profilesService?: ProfilesService
  ) {}

  ngOnInit(): void {
    this.loadProfiles()
    if (this.config.changed$) {
      this.subs.push(this.config.changed$.subscribe(() => this.loadProfiles()))
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.focusTimer)
    this.subs.forEach((s) => s.unsubscribe())
    this.subs = []
  }

  @HostListener('window:keydown', ['$event'])
  handleGlobalKeyDown(event: any): void {
    // 1. Double Shift Detection
    if (event.key === 'Shift') {
      const now = Date.now()
      if (now - this.lastShiftPressTime < 400 && now - this.lastShiftPressTime > 50) {
        this.open()
        this.lastShiftPressTime = 0
        return
      }
      this.lastShiftPressTime = now
      return
    } else {
      this.lastShiftPressTime = 0
    }

    // 2. Ctrl+Shift+P or Ctrl+K shortcut
    if (
      (event.ctrlKey || event.metaKey) &&
      (event.key === 'P' || event.key === 'p' || event.key === 'K' || event.key === 'k')
    ) {
      if (event.shiftKey || event.key === 'K' || event.key === 'k') {
        event.preventDefault()
        this.open()
      }
    }
  }

  open(): void {
    this.isOpen = true
    this.searchQuery = ''
    this.dropdownOptions = []
    this.selectedIndex = 0
    this.cdr.detectChanges()
    clearTimeout(this.focusTimer)
    this.focusTimer = setTimeout(() => {
      this.quickInputRef?.nativeElement?.focus()
    }, 50)
  }

  close(): void {
    this.isOpen = false
    this.searchQuery = ''
    this.dropdownOptions = []
    this.cdr.detectChanges()
  }

  clearSearch(): void {
    this.searchQuery = ''
    this.dropdownOptions = []
  }

  loadProfiles(): void {
    if (this.profilesService) {
      this.profilesService.getProfiles().then((p) => {
        this.profiles = (p || []).filter((item: any) => item.type !== 'workbench')
      })
    } else {
      this.profiles = ((this.config.store?.profiles || []) as any[]).filter(
        (item: any) => item.type !== 'workbench'
      )
    }
  }

  onSearchInput(): void {
    const q = this.searchQuery.trim()
    if (!q) {
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
        sublabel: `${m.options?.user || 'root'}@${m.options?.host || ''}:${m.options?.port || 22}`,
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
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.close()
      return
    }

    if (this.dropdownOptions.length === 0) {
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
      event.preventDefault?.()
      this.selectedIndex = (this.selectedIndex + 1) % this.dropdownOptions.length
    } else if (event.key === 'ArrowUp') {
      event.preventDefault?.()
      this.selectedIndex = (this.selectedIndex - 1 + this.dropdownOptions.length) % this.dropdownOptions.length
    } else if (event.key === 'Enter') {
      event.preventDefault?.()
      // Enter connects, Shift + Enter enters file transfer (SFTP)
      const openSftp = event.shiftKey
      this.executeOption(this.dropdownOptions[this.selectedIndex], openSftp)
    }
  }

  async executeOption(opt: DirectOption, openSftp = false, event?: MouseEvent): Promise<void> {
    if (event) {
      event.preventDefault()
      event.stopPropagation()
    }
    this.close()

    if (opt.type === 'profile' && opt.profile && this.profilesService) {
      try {
        const profToOpen = opt.profile
        const tab = await this.profilesService.openNewTabForProfile(profToOpen)
        if (openSftp && typeof (tab as any)?.__openSftpPreferred === 'function') {
          ;(tab as any).__openSftpPreferred()
        }
      } catch (err) {
        console.error('[Workbench] Failed to open profile', err)
      }
      return
    }

    // Direct connect
    const target = this.searchQuery.trim()
    if (!target || !this.profilesService) return

    try {
      let profile: any = null
      if (opt.protocol === 'TELNET') {
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
      console.warn('[Workbench] Quick connect failed', err)
    }
  }
}
