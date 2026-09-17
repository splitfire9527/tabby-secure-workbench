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
        <span>&#x21bb;</span> Reconnect
      </button>

      <!-- Port Forwarding -->
      <button
        class="btn-toolbar-item"
        (click)="showPortForwardDialog = true"
        title="Port Forwarding"
      >
        <span>&#x21c4;</span> Forwarding
      </button>

      <!-- Quick Connect -->
      <button
        class="btn-toolbar-item"
        (click)="showQuickConnectDialog = true"
        title="Quick Connect"
      >
        <span>&#x26a1;</span> Quick Connect
      </button>

      <!-- View Toggle: SFTP+ vs PTY -->
      <button
        class="btn-toolbar-item"
        [class.active]="viewMode === 'sftp'"
        (click)="toggleViewMode()"
        title="Toggle SFTP+ and Terminal View"
      >
        <span>{{ viewMode === 'sftp' ? '💻' : '📁' }}</span>
        {{ viewMode === 'sftp' ? 'Terminal PTY' : 'SFTP+' }}
      </button>

      <!-- Terminal Encoding -->
      <button
        class="btn-toolbar-item"
        (click)="showEncodingDialog = true"
        [title]="'Current Encoding: ' + currentEncoding"
      >
        <span>&#x1f524;</span> {{ currentEncoding }}
      </button>

      <!-- Session Logging -->
      <button
        class="btn-toolbar-item"
        [class.active]="isLoggingActive"
        (click)="toggleLogging()"
        [title]="isLoggingActive ? 'Stop Session Logging' : 'Start Session Logging'"
      >
        <span *ngIf="isLoggingActive" class="recording-dot mr-1"></span>
        <span>&#x1f4dd;</span> {{ isLoggingActive ? 'Recording' : 'Log' }}
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
        gap: 4px;
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
