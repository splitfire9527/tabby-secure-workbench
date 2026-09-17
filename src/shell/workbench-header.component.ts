import { Component, Input, Output, EventEmitter } from '@angular/core'

@Component({
  selector: 'workbench-header',
  template: `
    <div class="workbench-header">
      <div class="session-title text-truncate d-flex align-items-center">
        <span>{{ sessionTitle }}</span>
        <span
          class="status-badge text-uppercase font-weight-bold"
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
    </div>
  `,
})
export class WorkbenchHeaderComponent {
  @Input() activeTerminalTab: any
  @Input() viewMode: 'pty' | 'sftp' = 'pty'
  @Output() viewModeChange = new EventEmitter<'pty' | 'sftp'>()
  @Output() quickConnect = new EventEmitter<{ host: string; user: string; port: number }>()

  get sessionName(): string {
    return (
      this.activeTerminalTab?.title ||
      this.activeTerminalTab?.customTitle ||
      this.activeTerminalTab?.profile?.name ||
      'Workbench'
    )
  }

  get user(): string {
    return (
      this.activeTerminalTab?.profile?.options?.user ||
      this.activeTerminalTab?.profile?.options?.username ||
      'user'
    )
  }

  get host(): string {
    return this.activeTerminalTab?.profile?.options?.host || 'localhost'
  }

  get port(): number {
    return this.activeTerminalTab?.profile?.options?.port || 22
  }

  get connectionState(): 'Connected' | 'Disconnected' | 'Connecting' {
    const session =
      this.activeTerminalTab?.session ||
      this.activeTerminalTab?._session ||
      this.activeTerminalTab?.sshSession

    if (!session) return 'Disconnected'
    if (session.open === true) return 'Connected'
    if (session.open === false) return 'Disconnected'
    return 'Connecting'
  }

  get sessionTitle(): string {
    return `${this.sessionName} - ${this.user}@${this.host}:${this.port}`
  }
}
