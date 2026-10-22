import { Component, OnInit, OnDestroy, HostListener, Optional, ChangeDetectorRef } from '@angular/core'
import { ConfigService, NotificationsService } from 'tabby-core'
import { Subscription } from 'rxjs'
import { WorkbenchDialogService } from './workbench-dialog.service'
import { WorkbenchSessionConfigService } from '../config/workbench-session-config.service'
import { WorkbenchEncoding, DirectoryPair } from '../config/config.model'

@Component({
  selector: 'workbench-session-options-modal',
  template: `
    <div
      *ngIf="profile"
      class="workbench-modal-backdrop"
      (click)="cancel()"
    >
      <div class="workbench-modal-dialog session-options-dialog shadow-lg" (click)="$event.stopPropagation()">
        <!-- Titlebar -->
        <div class="modal-header d-flex align-items-center justify-content-between px-3 py-2">
          <div class="d-flex align-items-center gap-2">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" class="text-primary">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
            <span class="modal-title font-weight-bold text-dark" style="font-size: 13px;">
              Session Options - {{ profile.name || profile.options?.host || 'Session' }}
            </span>
          </div>
          <button class="btn-close-modal" (click)="cancel()">&times;</button>
        </div>

        <!-- Main Body: Category Tree (Left) + Options Panel (Right) -->
        <div class="modal-body-split">
          <!-- Left: Category Tree -->
          <div class="category-tree-col">
            <div class="category-header">Category:</div>
            <div class="category-tree">
              <div
                class="category-item"
                [class.selected]="activeCategory === 'connection'"
                (click)="activeCategory = 'connection'"
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                  <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                  <line x1="6" y1="6" x2="6.01" y2="6"></line>
                  <line x1="6" y1="18" x2="6.01" y2="18"></line>
                </svg>
                <span>Connection</span>
              </div>

              <div
                class="category-item"
                [class.selected]="activeCategory === 'terminal'"
                (click)="activeCategory = 'terminal'"
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="4 17 10 11 4 5"></polyline>
                  <line x1="12" y1="19" x2="20" y2="19"></line>
                </svg>
                <span>Terminal / Codec</span>
              </div>

              <div
                class="category-item"
                [class.selected]="activeCategory === 'log'"
                (click)="activeCategory = 'log'"
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                </svg>
                <span>Log File</span>
              </div>

              <div
                class="category-item"
                [class.selected]="activeCategory === 'sftp'"
                (click)="activeCategory = 'sftp'"
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                </svg>
                <span>SFTP & Pairs</span>
              </div>
            </div>
          </div>

          <!-- Right: Category Options Panel -->
          <div class="category-content-col p-3">
            <!-- 1. Connection (Native Tabby SSH) -->
            <div *ngIf="activeCategory === 'connection'">
              <div class="panel-section-title mb-2">Connection Settings</div>

              <div class="form-group mb-2">
                <label class="small font-weight-bold mb-1">会话名称 (Name)</label>
                <input
                  type="text"
                  class="form-control form-control-sm"
                  [(ngModel)]="tempProfile.name"
                  placeholder="My Session"
                />
              </div>

              <div class="form-group mb-2">
                <label class="small font-weight-bold mb-1">分组 (Group / Folder)</label>
                <input
                  type="text"
                  class="form-control form-control-sm"
                  [(ngModel)]="tempProfile.group"
                  placeholder="Production / Staging"
                />
              </div>

              <div class="row mb-2">
                <div class="col-8">
                  <label class="small font-weight-bold mb-1">主机地址 (Host / IP)</label>
                  <input
                    type="text"
                    class="form-control form-control-sm font-mono"
                    [(ngModel)]="tempProfile.options.host"
                    placeholder="192.168.1.100"
                  />
                </div>
                <div class="col-4">
                  <label class="small font-weight-bold mb-1">端口 (Port)</label>
                  <input
                    type="number"
                    class="form-control form-control-sm font-mono"
                    [(ngModel)]="tempProfile.options.port"
                    placeholder="22"
                  />
                </div>
              </div>

              <div class="form-group mb-2">
                <label class="small font-weight-bold mb-1">用户名 (Username)</label>
                <input
                  type="text"
                  class="form-control form-control-sm font-mono"
                  [(ngModel)]="tempProfile.options.user"
                  placeholder="root"
                />
              </div>
            </div>

            <!-- 2. Terminal / Codec -->
            <div *ngIf="activeCategory === 'terminal'">
              <div class="panel-section-title mb-2">Terminal & Codec Settings</div>

              <div class="form-group mb-3">
                <label class="small font-weight-bold mb-1">字符编码 (Character Encoding)</label>
                <select
                  class="form-control form-control-sm"
                  [(ngModel)]="tempWorkbench.encoding"
                >
                  <option value="inherit">继承默认会话配置 ({{ defaultEncoding }})</option>
                  <option value="UTF-8">UTF-8 (通用标准)</option>
                  <option value="GBK">GBK (简体中文老旧主机常用)</option>
                  <option value="GB2312">GB2312</option>
                  <option value="GB18030">GB18030</option>
                  <option value="BIG5">BIG5 (繁体中文)</option>
                </select>
                <small class="text-muted d-block mt-1" style="font-size: 11px;">
                  未完成的多字节字符将以 <code>U+FFFD</code> 占位，防止终端乱码。
                </small>
              </div>

              <div class="form-group mb-3">
                <label class="small font-weight-bold mb-1">终端仿真类型 (Terminal Emulation)</label>
                <input
                  type="text"
                  class="form-control form-control-sm font-mono"
                  [(ngModel)]="tempWorkbench.terminalType"
                  placeholder="xterm-256color"
                />
              </div>
            </div>

            <!-- 3. Log File (SecureCRT Style) -->
            <div *ngIf="activeCategory === 'log'">
              <div class="panel-section-title mb-2">Log File (SecureCRT 风格日志配置)</div>

              <div class="form-group mb-2">
                <label class="small font-weight-bold mb-1">日志文件命名模板 (Log file name)</label>
                <input
                  type="text"
                  class="form-control form-control-sm font-mono"
                  [(ngModel)]="tempLogging.logFileName"
                  placeholder="%H_%S_%Y%M%D_%h%m%s.log"
                />
                <div class="text-muted mt-1" style="font-size: 10px;">
                  宏变量: <code>%H</code>(主机), <code>%S</code>(会话名), <code>%Y%M%D</code>(年月日), <code>%h%m%s</code>(时分秒)
                </div>
              </div>

              <div class="form-group mb-2">
                <div class="custom-control custom-checkbox mb-1">
                  <input
                    type="checkbox"
                    class="custom-control-input"
                    id="soStartLog"
                    [(ngModel)]="tempLogging.startLogUponConnect"
                  />
                  <label class="custom-control-label small" for="soStartLog">
                    连接成功后自动启动日志记录 (Start log upon connect)
                  </label>
                </div>
                <div class="custom-control custom-checkbox">
                  <input
                    type="checkbox"
                    class="custom-control-input"
                    id="soPromptLog"
                    [(ngModel)]="tempLogging.promptForFilename"
                  />
                  <label class="custom-control-label small" for="soPromptLog">
                    每次提示确认文件名 (Prompt for filename)
                  </label>
                </div>
              </div>

              <div class="form-group mb-2">
                <label class="small font-weight-bold mb-1">如果文件已存在 (If file exists):</label>
                <div class="d-flex gap-3">
                  <div class="custom-control custom-radio mr-3">
                    <input
                      type="radio"
                      id="soAppend"
                      name="soAppendMode"
                      class="custom-control-input"
                      value="append"
                      [(ngModel)]="tempLogging.appendMode"
                    />
                    <label class="custom-control-label small" for="soAppend">追加内容 (Append)</label>
                  </div>
                  <div class="custom-control custom-radio">
                    <input
                      type="radio"
                      id="soOverwrite"
                      name="soAppendMode"
                      class="custom-control-input"
                      value="overwrite"
                      [(ngModel)]="tempLogging.appendMode"
                    />
                    <label class="custom-control-label small" for="soOverwrite">覆盖文件 (Overwrite)</label>
                  </div>
                </div>
              </div>

              <div class="form-group mb-2">
                <label class="small font-weight-bold mb-1">独立存储目录 (留空跟随全局):</label>
                <input
                  type="text"
                  class="form-control form-control-sm font-mono"
                  [(ngModel)]="tempLogging.directory"
                  placeholder="~/.tabby-logs"
                />
              </div>
            </div>

            <!-- 4. SFTP & Directory Pairs -->
            <div *ngIf="activeCategory === 'sftp'">
              <div class="panel-section-title mb-2">SFTP & Directory Pairs (文件传输与成对目录)</div>

              <div class="form-group mb-3">
                <label class="small font-weight-bold mb-1">默认 SFTP 停靠布局 (Preferred Dock Mode)</label>
                <select
                  class="form-control form-control-sm"
                  [(ngModel)]="tempSftp.preferredDockMode"
                >
                  <option value="bottom">停靠在终端下方 (Dock to Bottom)</option>
                  <option value="right">停靠在终端右侧 (Dock to Right)</option>
                  <option value="full">铺满标签页 (Full Tab)</option>
                  <option value="undock">弹出悬浮窗口 (Undock Floating)</option>
                </select>
              </div>

              <div class="form-group mb-3">
                <label class="small font-weight-bold mb-1">初始远程路径 (Initial Remote Path)</label>
                <input
                  type="text"
                  class="form-control form-control-sm font-mono"
                  [(ngModel)]="tempSftp.initialRemotePath"
                  placeholder="/var/www/html"
                />
              </div>

              <div class="form-group mb-3">
                <label class="small font-weight-bold mb-1">初始本地路径 (Initial Local Path)</label>
                <input
                  type="text"
                  class="form-control form-control-sm font-mono"
                  [(ngModel)]="tempSftp.initialLocalPath"
                  placeholder="/home/user/workspace"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="modal-footer d-flex justify-content-end gap-2 px-3 py-2">
          <button
            class="btn btn-sm px-3"
            style="background: #ffffff !important; border: 1px solid #d0d4dc !important; color: #1e293b !important; font-size: 12px !important; font-weight: 500;"
            (click)="cancel()"
          >取消</button>
          <button class="btn btn-sm btn-primary px-3" (click)="save()">确定</button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .workbench-modal-backdrop {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        background: rgba(0, 0, 0, 0.45) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        z-index: 50000 !important;
        user-select: none !important;
      }
      .workbench-modal-dialog {
        background: #ffffff;
        border: 1px solid #d0d4dc;
        border-radius: 6px;
        color: #222222;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
      }
      .modal-header {
        background: #f0f2f5;
        border-bottom: 1px solid #d0d4dc;
        height: 38px;
        flex-shrink: 0;
      }
      .btn-close-modal {
        background: transparent;
        border: none;
        color: #666666;
        font-size: 18px;
        line-height: 1;
        cursor: pointer;
        padding: 0 4px;
      }
      .btn-close-modal:hover {
        color: #000000;
      }
      .modal-footer {
        background: #f8f9fa;
        border-top: 1px solid #d0d4dc;
        height: 44px;
        flex-shrink: 0;
      }
      .modal-body-split {
        display: flex;
        flex: 1 1 auto;
        height: calc(100% - 82px);
        overflow: hidden;
      }
      .session-options-dialog {
        width: 680px;
        max-width: 95vw;
        height: 520px;
        max-height: 90vh;
      }
      .category-tree-col {
        width: 170px;
        min-width: 170px;
        background: #f0f2f5;
        border-right: 1px solid #d0d4dc;
        display: flex;
        flex-direction: column;
        user-select: none;
      }
      .category-header {
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 600;
        color: #333333;
        border-bottom: 1px solid #e0e4ec;
      }
      .category-tree {
        padding: 6px 0;
        overflow-y: auto;
      }
      .category-item {
        padding: 8px 14px;
        font-size: 12px;
        color: #333333;
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        border-left: 3px solid transparent;
        transition: all 0.15s ease;
      }
      .category-item:hover {
        background: #e4e7eb;
      }
      .category-item.selected {
        background: rgba(30, 112, 191, 0.12);
        color: #1e70bf;
        font-weight: 600;
        border-left-color: #1e70bf;
      }
      .category-content-col {
        flex: 1 1 auto;
        overflow-y: auto;
        background: #ffffff;
      }
      .panel-section-title {
        font-size: 13px;
        font-weight: 700;
        color: #222222;
        border-bottom: 1px solid #edf0f2;
        padding-bottom: 6px;
      }
      .form-control {
        background: #ffffff !important;
        border: 1px solid #c4c9d3 !important;
        color: #222222 !important;
        font-size: 12px !important;
      }
      .form-control:focus {
        border-color: #1e70bf !important;
        box-shadow: 0 0 0 2px rgba(30, 112, 191, 0.15) !important;
      }
    `,
  ],
})
export class WorkbenchSessionOptionsModalComponent implements OnInit, OnDestroy {
  profile: any = null
  activeCategory: 'connection' | 'terminal' | 'log' | 'sftp' = 'connection'

  tempProfile: any = { options: {} }
  tempWorkbench: any = {}
  tempLogging: any = {}
  tempSftp: any = {}

  private subs: Subscription[] = []

  constructor(
    public dialogService: WorkbenchDialogService,
    private sessionConfigService: WorkbenchSessionConfigService,
    private config: ConfigService,
    @Optional() private notifications?: NotificationsService,
    @Optional() public cdr?: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.subs.push(
      this.dialogService.sessionOptionsProfile$.subscribe((p) => {
        this.profile = p
        if (p) {
          this.initFromProfile(p)
        }
        this.cdr?.markForCheck()
        this.cdr?.detectChanges()
      })
    )
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe())
  }

  get defaultEncoding(): string {
    return this.sessionConfigService.getDefaultSessionConfig().encoding || 'UTF-8'
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.profile) {
      this.cancel()
    }
  }

  private initFromProfile(p: any): void {
    this.activeCategory = 'connection'
    this.tempProfile = {
      name: p.name || '',
      group: p.group || '',
      options: {
        host: p.options?.host || '',
        port: p.options?.port || 22,
        user: p.options?.user || '',
        auth: p.options?.auth || 'password',
      },
    }

    const sw = this.sessionConfigService.getSessionConfig(p)
    const stored = this.sessionConfigService.getStoredWorkbench(p)
    this.tempWorkbench = {
      encoding: stored.encoding || 'inherit',
      terminalType: sw.terminalType || 'xterm-256color',
    }
    this.tempLogging = {
      startLogUponConnect: sw.logging?.startLogUponConnect ?? false,
      promptForFilename: sw.logging?.promptForFilename ?? false,
      logFileName: sw.logging?.logFileName || '%H_%S_%Y%M%D_%h%m%s.log',
      mode: sw.logging?.mode || 'transcript',
      appendMode: sw.logging?.appendMode || 'append',
      directory: sw.logging?.directory || '',
    }
    this.tempSftp = {
      preferredDockMode: sw.sftp?.preferredDockMode || 'bottom',
      autoOpenSFTP: sw.sftp?.autoOpenSFTP ?? false,
      initialLocalPath: sw.sftp?.initialLocalPath || '',
      initialRemotePath: sw.sftp?.initialRemotePath || '',
    }
    this.cdr?.markForCheck()
  }

  save(): void {
    if (!this.profile) return

    // 1. Update native profile properties
    this.profile.name = this.tempProfile.name
    this.profile.group = this.tempProfile.group
    if (!this.profile.options) this.profile.options = {}
    this.profile.options.host = this.tempProfile.options.host
    this.profile.options.port = this.tempProfile.options.port
    this.profile.options.user = this.tempProfile.options.user

    // 2. Update Workbench extended properties via service
    this.sessionConfigService.saveSessionConfig(this.profile, {
      encoding: this.tempWorkbench.encoding,
      terminalType: this.tempWorkbench.terminalType,
      logging: this.tempLogging,
      sftp: { ...this.tempSftp, dockModeExplicit: true },
    })

    this.config.save()

    this.notifications?.info(`已保存会话选项: ${this.profile.name || this.profile.options.host}`)
    this.dialogService.closeSessionOptions()
  }

  cancel(): void {
    this.dialogService.closeSessionOptions()
  }
}
