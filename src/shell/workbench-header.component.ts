import { Component, Input, Output, EventEmitter } from '@angular/core'
import { DirectoryPair } from '../sftp-plus/directory-pair.model'

@Component({
  selector: 'workbench-header',
  template: `
    <!-- Session Toolbar (Action buttons only, left-aligned, 32px directly below tabs) -->
    <workbench-toolbar
      class="workbench-session-toolbar"
      [activeTerminalTab]="activeTerminalTab"
      [viewMode]="viewMode"
      (viewModeChange)="viewModeChange.emit($event)"
      (quickConnect)="quickConnect.emit($event)"
      (applyDirectoryPair)="applyDirectoryPair.emit($event)"
    ></workbench-toolbar>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 32px;
        min-height: 32px;
        max-height: 32px;
        flex-shrink: 0;
        user-select: none;
        z-index: 10;
        background: #f0f2f5;
        border-bottom: 1px solid #d0d4dc;
        box-sizing: border-box;
      }
      .workbench-session-toolbar {
        height: 32px;
        min-height: 32px;
        max-height: 32px;
        background: inherit;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        padding: 0 8px;
        gap: 4px;
        box-sizing: border-box;
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
  @Output() applyDirectoryPair = new EventEmitter<DirectoryPair>()
}
