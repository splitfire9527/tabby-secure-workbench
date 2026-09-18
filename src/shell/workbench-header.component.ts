import { Component, Input, Output, EventEmitter } from '@angular/core'

@Component({
  selector: 'workbench-header',
  template: `
    <div class="session-info">
      <span class="session-title">{{ sessionTitle }}</span>
      <span
        class="status-badge"
        [ngClass]="{
          connected: connectionState === 'Connected',
          connecting: connectionState === 'Connecting',
          disconnected: connectionState === 'Disconnected'
        }"
      >
        {{ connectionState }}
      </span>
    </div>

    <workbench-toolbar
      [activeTerminalTab]="activeTerminalTab"
      [viewMode]="viewMode"
      (viewModeChange)="viewModeChange.emit($event)"
      (quickConnect)="quickConnect.emit($event)"
    ></workbench-toolbar>
  `,
  styles: [
    `
      :host {
        display: flex;
        width: 100%;
        height: 36px;
        min-height: 36px;
        max-height: 36px;
        background: #21252b;
        border-bottom: 1px solid #181a1f;
        align-items: center;
        justify-content: space-between;
        padding: 0 12px;
        box-sizing: border-box;
        flex-shrink: 0;
        user-select: none;
        z-index: 10;
      }
      .session-info {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        overflow: hidden;
      }
      .session-title {
        font-weight: 600;
        font-size: 13px;
        color: #d7dae0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .status-badge {
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 3px;
        font-weight: 700;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        flex-shrink: 0;
      }
      .status-badge.connected {
        background: rgba(152, 195, 121, 0.2);
        color: #98c379;
        border: 1px solid rgba(152, 195, 121, 0.4);
      }
      .status-badge.connecting {
        background: rgba(97, 175, 239, 0.2);
        color: #61afef;
        border: 1px solid rgba(97, 175, 239, 0.4);
      }
      .status-badge.disconnected {
        background: rgba(224, 108, 117, 0.2);
        color: #e06c75;
        border: 1px solid rgba(224, 108, 117, 0.4);
      }
    `,
  ],
})
export class WorkbenchHeaderComponent {
  @Input() activeTerminalTab: any
  @Input() activeProfile: any
  @Input() viewMode: 'pty' | 'sftp' = 'pty'
  @Output() viewModeChange = new EventEmitter<'pty' | 'sftp'>()
  @Output() quickConnect = new EventEmitter<{ host: string; user: string; port: number }>()

  get sessionName(): string {
    return (
      this.activeTerminalTab?.title ||
      this.activeTerminalTab?.customTitle ||
      this.activeTerminalTab?.profile?.name ||
      this.activeProfile?.name ||
      'Workbench'
    )
  }

  get user(): string {
    return (
      this.activeTerminalTab?.profile?.options?.user ||
      this.activeTerminalTab?.profile?.options?.username ||
      this.activeProfile?.options?.user ||
      this.activeProfile?.options?.username ||
      'user'
    )
  }

  get host(): string {
    return (
      this.activeTerminalTab?.profile?.options?.host ||
      this.activeProfile?.options?.host ||
      'localhost'
    )
  }

  get port(): number {
    return (
      this.activeTerminalTab?.profile?.options?.port ||
      this.activeProfile?.options?.port ||
      22
    )
  }

  get connectionState(): 'Connected' | 'Disconnected' | 'Connecting' {
    const session =
      this.activeTerminalTab?.session ||
      this.activeTerminalTab?._session ||
      this.activeTerminalTab?.sshSession

    if (session) {
      if (session.open === false) return 'Disconnected'
      return 'Connected'
    }
    if (this.activeTerminalTab?.frontend) return 'Connected'
    return 'Connected'
  }

  get sessionTitle(): string {
    return `${this.sessionName} - ${this.user}@${this.host}:${this.port}`
  }
}
