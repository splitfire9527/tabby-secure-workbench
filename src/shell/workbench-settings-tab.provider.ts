import { Component } from '@angular/core'
import { SettingsTabProvider } from 'tabby-settings'
import { ConfigService } from 'tabby-core'
import { DEFAULT_WORKBENCH_CONFIG, WorkbenchEncoding } from '../config/config.model'

@Component({
  selector: 'workbench-settings-tab',
  template: `
    <h3 class="mb-3">Secure Workbench</h3>

    <div class="card mb-3 p-3">
      <h5 class="card-title">General Settings</h5>

      <div class="form-group mb-3">
        <label class="font-weight-bold">Hide Tabby Built-in SFTP Button</label>
        <div class="custom-control custom-switch">
          <input
            type="checkbox"
            class="custom-control-input"
            id="cfgHideSftp"
            [(ngModel)]="hideNativeSFTP"
            (change)="saveConfig()"
          />
          <label class="custom-control-label" for="cfgHideSftp">
            Hide Tabby's native toolbar SFTP button to avoid confusion
          </label>
        </div>
      </div>

      <div class="form-group mb-3">
        <label class="font-weight-bold">Default Terminal Encoding</label>
        <select
          class="form-control"
          [(ngModel)]="defaultEncoding"
          (change)="saveConfig()"
        >
          <option value="UTF-8">UTF-8 (Default)</option>
          <option value="GBK">GBK</option>
          <option value="GB2312">GB2312</option>
          <option value="GB18030">GB18030</option>
          <option value="BIG5">BIG5</option>
        </select>
        <small class="form-text text-muted">
          New terminal sessions will default to this byte stream codec.
        </small>
      </div>

      <div class="form-group mb-3">
        <label class="font-weight-bold">Bottom Dock Height</label>
        <input
          type="number"
          class="form-control"
          [(ngModel)]="dockHeight"
          (change)="saveConfig()"
        />
        <small class="form-text text-muted">
          Default expanded height in pixels for the transfer bottom dock (default 140px).
        </small>
      </div>
    </div>

    <div class="card mb-3 p-3">
      <h5 class="card-title">Session Logging Policy</h5>

      <div class="form-group mb-3">
        <label class="font-weight-bold">Log Root Directory</label>
        <input
          type="text"
          class="form-control"
          placeholder="~/.tabby-logs"
          [(ngModel)]="logDirectory"
          (change)="saveConfig()"
        />
      </div>

      <div class="form-group mb-3">
        <label class="font-weight-bold">Filename Template</label>
        <input
          type="text"
          class="form-control"
          [(ngModel)]="filenameTemplate"
          (change)="saveConfig()"
        />
        <small class="form-text text-muted">
          Available tokens: %H (Host), %S (Session), %Y (Year), %M (Month), %D (Day), %h (Hour), %m (Min), %s (Sec)
        </small>
      </div>

      <div class="form-group mb-3">
        <label class="font-weight-bold">Max File Size (MB)</label>
        <input
          type="number"
          class="form-control"
          [(ngModel)]="maxFileSizeMB"
          (change)="saveConfig()"
        />
      </div>
    </div>
  `,
})
export class WorkbenchSettingsTabComponent {
  constructor(private config: ConfigService) {}

  get hideNativeSFTP(): boolean {
    return !!this.config.store?.secureWorkbench?.hideNativeSFTPButton
  }

  set hideNativeSFTP(val: boolean) {
    this.ensureConfig().hideNativeSFTPButton = val
  }

  get defaultEncoding(): WorkbenchEncoding {
    return this.config.store?.secureWorkbench?.defaultEncoding || 'UTF-8'
  }

  set defaultEncoding(val: WorkbenchEncoding) {
    this.ensureConfig().defaultEncoding = val
  }

  get dockHeight(): number {
    return this.config.store?.secureWorkbench?.dockHeight || 140
  }

  set dockHeight(val: number) {
    this.ensureConfig().dockHeight = val || 140
  }

  get logDirectory(): string {
    return this.config.store?.secureWorkbench?.logging?.directory || ''
  }

  set logDirectory(val: string) {
    this.ensureConfig().logging.directory = val
  }

  get filenameTemplate(): string {
    return (
      this.config.store?.secureWorkbench?.logging?.filenameTemplate ||
      DEFAULT_WORKBENCH_CONFIG.logging.filenameTemplate
    )
  }

  set filenameTemplate(val: string) {
    this.ensureConfig().logging.filenameTemplate = val
  }

  get maxFileSizeMB(): number {
    return (
      this.config.store?.secureWorkbench?.logging?.maxFileSizeMB ||
      DEFAULT_WORKBENCH_CONFIG.logging.maxFileSizeMB
    )
  }

  set maxFileSizeMB(val: number) {
    this.ensureConfig().logging.maxFileSizeMB = val || 50
  }

  private ensureConfig() {
    if (!this.config.store.secureWorkbench) {
      this.config.store.secureWorkbench = { ...DEFAULT_WORKBENCH_CONFIG }
    }
    if (!this.config.store.secureWorkbench.logging) {
      this.config.store.secureWorkbench.logging = { ...DEFAULT_WORKBENCH_CONFIG.logging }
    }
    return this.config.store.secureWorkbench
  }

  saveConfig(): void {
    this.config.save()
  }
}

export class WorkbenchSettingsTabProvider extends SettingsTabProvider {
  id = 'secure-workbench'
  icon = 'shield'
  title = 'Secure Workbench'

  getComponentType(): any {
    return WorkbenchSettingsTabComponent
  }
}
