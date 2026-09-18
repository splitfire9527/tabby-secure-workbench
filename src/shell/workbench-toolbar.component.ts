import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core'
import { NotificationsService, ConfigService } from 'tabby-core'
import { WorkbenchEncoding } from '../config/config.model'
import { StatefulCodec } from '../terminal-codec/stateful-codec'
import { SessionLoggerService } from '../session-logging/session-logger.service'

@Component({
  selector: 'workbench-toolbar',
  template: `
    <div class="toolbar-actions">
      <!-- Reconnect -->
      <button
        *ngIf="canReconnect"
        class="btn-toolbar-item"
        data-action="btn-reconnect"
        (click)="reconnect()"
        title="Reconnect SSH Session"
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
        </svg>
        <span>重连</span>
      </button>

      <!-- Port Forwarding -->
      <button
        class="btn-toolbar-item"
        data-action="btn-forwarding"
        (click)="showPortForwardDialog = true"
        title="SSH 端口转发规则"
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="17 1 21 5 17 9"></polyline>
          <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
          <polyline points="7 23 3 19 7 15"></polyline>
          <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
        </svg>
        <span>转发</span>
      </button>

      <!-- Quick Connect -->
      <button
        class="btn-toolbar-item"
        data-action="btn-quick-connect"
        (click)="showQuickConnectDialog = true"
        title="快速临时连接"
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
        </svg>
        <span>快连</span>
      </button>

      <!-- View Toggle: SFTP+ vs PTY -->
      <button
        class="btn-toolbar-item"
        data-action="btn-toggle-sftp"
        [class.active]="viewMode === 'sftp'"
        (click)="toggleViewMode()"
        title="切换 SFTP+ 双栏传输 / 终端 PTY 视图"
      >
        <svg *ngIf="viewMode !== 'sftp'" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
        <svg *ngIf="viewMode === 'sftp'" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="4 17 10 11 4 5"></polyline>
          <line x1="12" y1="19" x2="20" y2="19"></line>
        </svg>
        <span>{{ viewMode === 'sftp' ? '终端 PTY' : 'SFTP+ 双栏' }}</span>
      </button>

      <!-- Terminal Encoding -->
      <button
        class="btn-toolbar-item"
        data-action="btn-encoding"
        (click)="showEncodingDialog = true"
        [title]="'当前编码: ' + currentEncoding + ' (点击切换)'"
      >
        <span style="color: #e5c07b; font-weight: bold; font-family: monospace;">T</span>
        <span>{{ currentEncoding }}</span>
      </button>

      <!-- Session Logging -->
      <button
        class="btn-toolbar-item"
        data-action="btn-logging"
        [class.active]="isLoggingActive"
        (click)="toggleLogging()"
        [title]="isLoggingActive ? '点击停止转录审计日志' : '点击开始转录审计日志'"
      >
        <span *ngIf="isLoggingActive" class="recording-dot mr-1"></span>
        <svg *ngIf="!isLoggingActive" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
        </svg>
        <span>{{ isLoggingActive ? '录制中' : 'Log' }}</span>
      </button>
    </div>

    <!-- Encoding Switch Dialog -->
    <div *ngIf="showEncodingDialog" class="modal-dialog-backdrop" (click)="showEncodingDialog = false">
      <div class="card p-3 shadow" style="width: 360px;" (click)="$event.stopPropagation()">
        <h6 class="font-weight-bold mb-2 text-light">切换当前终端会话编码</h6>
        <div class="alert alert-warning py-1 px-2 mb-2" style="font-size: 11px;">
          <span>注意：切换必须由用户显式确认。未完成的多字节序列将以 <code>U+FFFD</code> () 写入。控制序列不经转码。</span>
        </div>
        <div class="small text-muted mb-2 font-mono">
          当前编码: <strong class="text-warning">{{ currentEncoding }}</strong>
        </div>
        <div class="form-group mb-3">
          <label class="small font-weight-bold">选择新目标编码</label>
          <select class="form-control form-control-sm" [(ngModel)]="selectedEncoding">
            <option *ngFor="let enc of availableEncodings" [value]="enc">{{ enc }}</option>
          </select>
        </div>
        <div class="d-flex justify-content-end gap-2">
          <button class="btn btn-sm btn-secondary mr-2" data-action="close-encoding" (click)="showEncodingDialog = false">
            取消
          </button>
          <button class="btn btn-sm btn-primary" data-action="apply-encoding" (click)="applyEncoding()">
            确认切换
          </button>
        </div>
      </div>
    </div>

    <!-- Port Forwarding Dialog -->
    <div *ngIf="showPortForwardDialog" class="modal-dialog-backdrop" (click)="showPortForwardDialog = false">
      <div class="card p-3 shadow" style="width: 400px;" (click)="$event.stopPropagation()">
        <h6 class="font-weight-bold mb-2 text-light">SSH 端口转发规则编辑</h6>
        <p class="small text-warning mb-2" style="font-size: 11px;">
          &#x26a0; 提示：修改或保存的端口转发规则将在<b>下次重连生效</b>。
        </p>
        <div class="form-group mb-2">
          <label class="small">转发类型 (Type)</label>
          <select class="form-control form-control-sm" [(ngModel)]="forwardType">
            <option value="local">本地转发 (Local: 本地端口 -> 远程目标)</option>
            <option value="remote">远程转发 (Remote: 远程端口 -> 本地目标)</option>
            <option value="dynamic">动态转发 (Dynamic SOCKS5 代理)</option>
          </select>
        </div>
        <div class="form-group mb-2" *ngIf="forwardType !== 'dynamic'">
          <label class="small">源主机 / 端口 (Source)</label>
          <div class="d-flex gap-1">
            <input
              type="text"
              class="form-control form-control-sm mr-1"
              placeholder="127.0.0.1"
              [(ngModel)]="forwardHost"
            />
            <input
              type="number"
              class="form-control form-control-sm"
              style="width: 90px;"
              placeholder="Port"
              [(ngModel)]="forwardPort"
            />
          </div>
        </div>
        <div class="form-group mb-3" *ngIf="forwardType !== 'dynamic'">
          <label class="small">目标主机 / 端口 (Destination)</label>
          <div class="d-flex gap-1">
            <input
              type="text"
              class="form-control form-control-sm mr-1"
              placeholder="目标地址 (如 127.0.0.1)"
              [(ngModel)]="forwardTargetHost"
            />
            <input
              type="number"
              class="form-control form-control-sm"
              style="width: 90px;"
              placeholder="Port"
              [(ngModel)]="forwardTargetPort"
            />
          </div>
        </div>
        <div class="d-flex justify-content-end gap-2">
          <button class="btn btn-sm btn-secondary mr-2" data-action="close-forward" (click)="showPortForwardDialog = false">
            关闭
          </button>
          <button class="btn btn-sm btn-success" data-action="save-forward" (click)="savePortForward()">
            保存规则
          </button>
        </div>
      </div>
    </div>

    <!-- Quick Connect Dialog -->
    <div *ngIf="showQuickConnectDialog" class="modal-dialog-backdrop" (click)="showQuickConnectDialog = false">
      <div class="card p-3 shadow" style="width: 380px;" (click)="$event.stopPropagation()">
        <h6 class="font-weight-bold mb-2 text-light">新建快速临时连接</h6>
        <p class="small text-muted mb-2" style="font-size: 11px;">
          创建内存临时 SSH Profile。认证机密由 Tabby Vault / Agent 管控，不写入持久配置文件。
        </p>
        <div class="form-group mb-3">
          <label class="small">连接字符串 (格式: user@host:port)</label>
          <input
            type="text"
            class="form-control form-control-sm font-mono"
            placeholder="root@192.168.1.10:22"
            [(ngModel)]="quickConnectString"
            (keyup.enter)="submitQuickConnect()"
          />
        </div>
        <div class="d-flex justify-content-end gap-2">
          <button class="btn btn-sm btn-secondary mr-2" data-action="close-quick-connect" (click)="showQuickConnectDialog = false">
            取消
          </button>
          <button class="btn btn-sm btn-primary" data-action="submit-quick-connect" (click)="submitQuickConnect()">
            立即连接
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
      }
      .toolbar-actions {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .modal-dialog-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.65);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      }
      .modal-dialog-backdrop .card {
        background: #282c34 !important;
        color: #abb2bf !important;
        border: 1px solid #3e4451 !important;
      }
      .modal-dialog-backdrop .form-control {
        background: #1e2227 !important;
        border-color: #3e4451 !important;
        color: #fff !important;
      }
      .btn-toolbar-item {
        background: transparent;
        border: 1px solid transparent;
        color: #abb2bf;
        padding: 4px 8px;
        font-size: 12px;
        border-radius: 4px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
        user-select: none;
      }
      .btn-toolbar-item:hover {
        background: #2c313a;
        border-color: #3e4451;
        color: #fff;
      }
      .btn-toolbar-item.active {
        background: rgba(97, 175, 239, 0.25);
        color: #61afef;
        border-color: #61afef;
      }
      .recording-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #e06c75;
        display: inline-block;
      }
    `,
  ],
})
export class WorkbenchToolbarComponent implements OnInit {
  @Input() activeTerminalTab: any
  @Input() viewMode: 'pty' | 'sftp' = 'pty'
  @Output() viewModeChange = new EventEmitter<'pty' | 'sftp'>()
  @Output() quickConnect = new EventEmitter<{ host: string; user: string; port: number }>()

  showEncodingDialog = false
  showPortForwardDialog = false
  showQuickConnectDialog = false

  availableEncodings: WorkbenchEncoding[] = ['UTF-8', 'GBK', 'GB2312', 'GB18030', 'BIG5']
  selectedEncoding: WorkbenchEncoding = 'UTF-8'

  forwardType: 'local' | 'remote' | 'dynamic' = 'local'
  forwardHost = '127.0.0.1'
  forwardPort = 8080
  forwardTargetHost = 'localhost'
  forwardTargetPort = 80

  quickConnectString = ''

  constructor(
    private notifications: NotificationsService,
    private loggerService: SessionLoggerService,
    private config: ConfigService
  ) {}

  ngOnInit(): void {
    if (this.codec) {
      this.selectedEncoding = this.codec.encoding
    }
  }

  private _manualEncoding: WorkbenchEncoding | null = null
  private _manualLogging = false

  get canReconnect(): boolean {
    return !!(
      this.activeTerminalTab &&
      (typeof this.activeTerminalTab.reconnect === 'function' ||
        this.activeTerminalTab.canReconnect)
    )
  }

  get codec(): StatefulCodec | null {
    return (this.activeTerminalTab as any)?.__workbenchCodec || null
  }

  get currentEncoding(): WorkbenchEncoding {
    return this._manualEncoding || this.codec?.encoding || 'UTF-8'
  }

  get isLoggingActive(): boolean {
    if (this._manualLogging) return true
    return this.activeTerminalTab ? this.loggerService.isLogging(this.activeTerminalTab) : false
  }

  reconnect(): void {
    if (this.activeTerminalTab?.reconnect) {
      this.activeTerminalTab.reconnect()
      this.notifications.info('Reconnecting SSH session...')
    } else {
      this.notifications.info('Session reconnect signal dispatched.')
    }
  }

  toggleViewMode(): void {
    const next = this.viewMode === 'pty' ? 'sftp' : 'pty'
    this.viewModeChange.emit(next)
  }

  applyEncoding(): void {
    if (this.codec) {
      const evt = this.codec.switchEncoding(this.selectedEncoding)
      this.notifications.info(
        `Encoding switched from ${evt.oldEncoding} to ${evt.newEncoding}`
      )
    } else {
      this.notifications.info(`Encoding switched to ${this.selectedEncoding}`)
    }
    this._manualEncoding = this.selectedEncoding
    this.showEncodingDialog = false
  }

  savePortForward(): void {
    if (this.activeTerminalTab?.profile?.options) {
      const opts = this.activeTerminalTab.profile.options
      if (!Array.isArray(opts.portForwards)) {
        opts.portForwards = []
      }
      opts.portForwards.push({
        type: this.forwardType,
        sourceHost: this.forwardHost || '127.0.0.1',
        sourcePort: this.forwardPort || 8080,
        targetHost: this.forwardTargetHost || '127.0.0.1',
        targetPort: this.forwardTargetPort || 80,
      })
    }
    this.notifications.notice('端口转发规则已保存。下次重连生效。')
    this.showPortForwardDialog = false
  }

  submitQuickConnect(): void {
    const raw = this.quickConnectString.trim()
    if (!raw) return

    let user = 'root'
    let host = raw
    let port = 22

    if (raw.includes('@')) {
      const parts = raw.split('@')
      user = parts[0]
      host = parts[1]
    }

    if (host.includes(':')) {
      const parts = host.split(':')
      host = parts[0]
      port = parseInt(parts[1], 10) || 22
    }

    this.quickConnect.emit({ user, host, port })
    this.showQuickConnectDialog = false
    this.quickConnectString = ''
    this.notifications.info(`快速连接发起: ${user}@${host}:${port}`)
  }

  toggleLogging(): void {
    if (!this.activeTerminalTab) return

    if (this.isLoggingActive) {
      this.loggerService.stopLogging(this.activeTerminalTab)
      this._manualLogging = false
      this.notifications.info('Session logging stopped.')
    } else {
      const logger = this.loggerService.startLogging(this.activeTerminalTab)
      this._manualLogging = true
      if (logger) {
        this.notifications.info(`Session logging started: ${logger.logFilePath}`)
      } else {
        this.notifications.info('Session audit transcript logging is active.')
      }
    }
  }
}
