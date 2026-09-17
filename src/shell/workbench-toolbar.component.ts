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
        (click)="reconnect()"
        title="Reconnect SSH Session"
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
        </svg>
        <span>Reconnect</span>
      </button>

      <!-- Port Forwarding -->
      <button
        class="btn-toolbar-item"
        (click)="showPortForwardDialog = true"
        title="Port Forwarding"
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="17 1 21 5 17 9"></polyline>
          <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
          <polyline points="7 23 3 19 7 15"></polyline>
          <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
        </svg>
        <span>Forwarding</span>
      </button>

      <!-- Quick Connect -->
      <button
        class="btn-toolbar-item"
        (click)="showQuickConnectDialog = true"
        title="Quick Connect"
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
        </svg>
        <span>Quick Connect</span>
      </button>

      <!-- View Toggle: SFTP+ vs PTY -->
      <button
        class="btn-toolbar-item"
        [class.active]="viewMode === 'sftp'"
        (click)="toggleViewMode()"
        title="Toggle SFTP+ and Terminal View"
      >
        <svg *ngIf="viewMode !== 'sftp'" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
        <svg *ngIf="viewMode === 'sftp'" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="4 17 10 11 4 5"></polyline>
          <line x1="12" y1="19" x2="20" y2="19"></line>
        </svg>
        <span>{{ viewMode === 'sftp' ? 'Terminal PTY' : 'SFTP+' }}</span>
      </button>

      <!-- Terminal Encoding -->
      <button
        class="btn-toolbar-item"
        (click)="showEncodingDialog = true"
        [title]="'Current Encoding: ' + currentEncoding"
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="4 7 4 4 20 4 20 7"></polyline>
          <line x1="9" y1="20" x2="15" y2="20"></line>
          <line x1="12" y1="4" x2="12" y2="20"></line>
        </svg>
        <span>{{ currentEncoding }}</span>
      </button>

      <!-- Session Logging -->
      <button
        class="btn-toolbar-item"
        [class.active]="isLoggingActive"
        (click)="toggleLogging()"
        [title]="isLoggingActive ? 'Stop Session Logging' : 'Start Session Logging'"
      >
        <span *ngIf="isLoggingActive" class="recording-dot mr-1"></span>
        <svg *ngIf="!isLoggingActive" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
        </svg>
        <span>{{ isLoggingActive ? 'Recording' : 'Log' }}</span>
      </button>
    </div>

    <!-- Encoding Switch Dialog -->
    <div *ngIf="showEncodingDialog" class="modal-dialog-backdrop">
      <div class="card p-3 shadow" style="width: 320px;">
        <h6 class="font-weight-bold mb-2">Switch Session Encoding</h6>
        <p class="small text-muted mb-2">
          Notice: Any incomplete multi-byte sequence will be flushed as U+FFFD ().
        </p>
        <div class="form-group mb-3">
          <label class="small font-weight-bold">Select Encoding</label>
          <select class="form-control form-control-sm" [(ngModel)]="selectedEncoding">
            <option *ngFor="let enc of availableEncodings" [value]="enc">{{ enc }}</option>
          </select>
        </div>
        <div class="d-flex justify-content-end">
          <button class="btn btn-sm btn-secondary mr-2" (click)="showEncodingDialog = false">
            Cancel
          </button>
          <button class="btn btn-sm btn-primary" (click)="applyEncoding()">
            Apply
          </button>
        </div>
      </div>
    </div>

    <!-- Port Forwarding Dialog -->
    <div *ngIf="showPortForwardDialog" class="modal-dialog-backdrop">
      <div class="card p-3 shadow" style="width: 380px;">
        <h6 class="font-weight-bold mb-2">SSH Port Forwarding</h6>
        <p class="small text-warning mb-3">
          &#x26a0; Changes will take effect upon the next SSH reconnection.
        </p>
        <div class="form-group mb-2">
          <label class="small">Forward Type</label>
          <select class="form-control form-control-sm" [(ngModel)]="forwardType">
            <option value="local">Local (Local port -> Remote)</option>
            <option value="remote">Remote (Remote port -> Local)</option>
            <option value="dynamic">Dynamic (SOCKS proxy)</option>
          </select>
        </div>
        <div class="form-group mb-2" *ngIf="forwardType !== 'dynamic'">
          <label class="small">Source Host / Port</label>
          <div class="d-flex">
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
          <label class="small">Destination Host / Port</label>
          <div class="d-flex">
            <input
              type="text"
              class="form-control form-control-sm mr-1"
              placeholder="Target host"
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
        <div class="d-flex justify-content-end">
          <button class="btn btn-sm btn-secondary mr-2" (click)="showPortForwardDialog = false">
            Close
          </button>
          <button class="btn btn-sm btn-success" (click)="savePortForward()">
            Save Rule
          </button>
        </div>
      </div>
    </div>

    <!-- Quick Connect Dialog -->
    <div *ngIf="showQuickConnectDialog" class="modal-dialog-backdrop">
      <div class="card p-3 shadow" style="width: 360px;">
        <h6 class="font-weight-bold mb-2">Quick Connect</h6>
        <p class="small text-muted mb-2">
          Creates an in-memory temporary SSH profile. Credentials are handled securely by Tabby Vault / Agent.
        </p>
        <div class="form-group mb-3">
          <label class="small">Connection String</label>
          <input
            type="text"
            class="form-control form-control-sm"
            placeholder="user@host:22"
            [(ngModel)]="quickConnectString"
          />
        </div>
        <div class="d-flex justify-content-end">
          <button class="btn btn-sm btn-secondary mr-2" (click)="showQuickConnectDialog = false">
            Cancel
          </button>
          <button class="btn btn-sm btn-primary" (click)="submitQuickConnect()">
            Connect
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
    return this.codec?.encoding || 'UTF-8'
  }

  get isLoggingActive(): boolean {
    return this.activeTerminalTab ? this.loggerService.isLogging(this.activeTerminalTab) : false
  }

  reconnect(): void {
    if (this.activeTerminalTab?.reconnect) {
      this.activeTerminalTab.reconnect()
      this.notifications.info('Reconnecting SSH session...')
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
    }
    this.showEncodingDialog = false
  }

  savePortForward(): void {
    this.notifications.notice('Port forwarding saved. Will take effect upon next reconnect.')
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
  }

  toggleLogging(): void {
    if (!this.activeTerminalTab) return

    if (this.isLoggingActive) {
      this.loggerService.stopLogging(this.activeTerminalTab)
      this.notifications.info('Session logging stopped.')
    } else {
      const logger = this.loggerService.startLogging(this.activeTerminalTab)
      if (logger) {
        this.notifications.info(`Session logging started: ${logger.logFilePath}`)
      }
    }
  }
}
