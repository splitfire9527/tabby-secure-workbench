import { Component, Injectable, Optional } from '@angular/core'
import { SettingsTabProvider } from 'tabby-settings'
import { ConfigService, NotificationsService } from 'tabby-core'
import { DEFAULT_WORKBENCH_CONFIG, WorkbenchEncoding, DefaultSessionConfig } from '../config/config.model'
import { WorkbenchSessionConfigService } from '../config/workbench-session-config.service'

@Component({
  selector: 'workbench-settings-tab',
  template: `
    <h3 class="mb-3">Secure Workbench 工作台设置</h3>

    <div class="card mb-3 p-3">
      <h5 class="card-title">通用设置</h5>

      <div class="form-group mb-3">
        <label class="font-weight-bold">显示标签页编号</label>
        <div class="custom-control custom-switch">
          <input
            type="checkbox"
            class="custom-control-input"
            id="cfgShowTabIndices"
            [(ngModel)]="showTabIndices"
            (change)="saveConfig()"
          />
          <label class="custom-control-label" style="color: #374151; font-weight: 500;" for="cfgShowTabIndices">
            在每个标签页上显示序号 (1, 2...)
          </label>
        </div>
      </div>

      <div class="form-group mb-3">
        <label class="font-weight-bold">显示标签页关闭按钮</label>
        <div class="custom-control custom-switch">
          <input
            type="checkbox"
            class="custom-control-input"
            id="cfgShowTabClose"
            [(ngModel)]="showTabCloseButton"
            (change)="saveConfig()"
          />
          <label class="custom-control-label" style="color: #374151; font-weight: 500;" for="cfgShowTabClose">
            在每个标签页上显示 × 关闭按钮
          </label>
        </div>
      </div>

      <div class="form-group mb-3">
        <label class="font-weight-bold">隐藏 Tabby 原生 SFTP 按钮</label>
        <div class="custom-control custom-switch">
          <input
            type="checkbox"
            class="custom-control-input"
            id="cfgHideSftp"
            [(ngModel)]="hideNativeSFTP"
            (change)="saveConfig()"
          />
          <label class="custom-control-label" style="color: #374151; font-weight: 500;" for="cfgHideSftp">
            隐藏 Tabby 原生工具栏 SFTP 按钮以防功能混淆
          </label>
        </div>
      </div>

      <div class="form-group mb-3">
        <label class="font-weight-bold">全局默认终端编码</label>
        <select
          class="form-control"
          [(ngModel)]="defaultEncoding"
          (change)="saveConfig()"
        >
          <option value="UTF-8">UTF-8 (推荐/默认)</option>
          <option value="GBK">GBK (简体中文常用)</option>
          <option value="GB2312">GB2312</option>
          <option value="GB18030">GB18030</option>
          <option value="BIG5">BIG5 (繁体中文)</option>
        </select>
        <small class="form-text" style="font-size: 12px; color: #495057;">
          新建终端会话将以此编码解码字节流。
        </small>
      </div>

      <div class="form-group mb-3">
        <label class="font-weight-bold">底部传输抽屉高度 (px)</label>
        <input
          type="number"
          class="form-control"
          [(ngModel)]="dockHeight"
          (change)="saveConfig()"
        />
        <small class="form-text" style="font-size: 12px; color: #495057;">
          底部传输队列抽屉展开时的默认高度 (默认 140px)。
        </small>
      </div>
    </div>

    <div class="card mb-3 p-3">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h5 class="card-title text-primary mb-0">默认会话配置</h5>
        <span class="badge badge-primary font-weight-normal" style="font-size: 11px; padding: 3px 6px;">SecureCRT 对齐</span>
      </div>
      <p class="small mb-3" style="font-size: 12px; color: #495057;">
        新建会话将自动继承以下默认参数；亦可随时将默认配置一键应用至现有全部会话。
      </p>

      <div class="row mb-3">
        <div class="col-6">
          <label class="font-weight-bold small">默认终端编码</label>
          <select
            class="form-control form-control-sm"
            [(ngModel)]="defaultSessionEncoding"
          >
            <option value="UTF-8">UTF-8 (推荐/通用)</option>
            <option value="GBK">GBK (简体中文常用)</option>
            <option value="GB2312">GB2312</option>
            <option value="GB18030">GB18030</option>
            <option value="BIG5">BIG5 (繁体中文)</option>
          </select>
        </div>
        <div class="col-6">
          <label class="font-weight-bold small">默认终端仿真</label>
          <input
            type="text"
            class="form-control form-control-sm font-mono"
            [(ngModel)]="defaultSessionTerminalType"
            placeholder="xterm-256color"
          />
        </div>
      </div>

      <div class="form-group mb-3">
        <label class="font-weight-bold small">默认 SFTP 停靠布局</label>
        <select
          class="form-control form-control-sm"
          [(ngModel)]="defaultSessionPreferredDock"
        >
          <option value="bottom">停靠在终端下方</option>
          <option value="right">停靠在终端右侧</option>
          <option value="full">铺满标签页</option>
          <option value="undock">弹出悬浮窗口</option>
        </select>
      </div>

      <div class="form-group mb-2">
        <label class="font-weight-bold small">会话日志自启策略</label>
        <div class="custom-control custom-switch mb-1">
          <input
            type="checkbox"
            class="custom-control-input"
            id="cfgDefStartLog"
            [(ngModel)]="defaultSessionStartLogUponConnect"
          />
          <label class="custom-control-label small" style="color: #374151; font-weight: 500;" for="cfgDefStartLog">
            连接成功后自动启动会话日志记录
          </label>
        </div>
        <div class="custom-control custom-switch">
          <input
            type="checkbox"
            class="custom-control-input"
            id="cfgDefPromptLog"
            [(ngModel)]="defaultSessionPromptForFilename"
          />
          <label class="custom-control-label small" style="color: #374151; font-weight: 500;" for="cfgDefPromptLog">
            每次启动时提示确认文件名
          </label>
        </div>
      </div>

      <div class="form-group mb-3">
        <label class="font-weight-bold small">默认日志文件名模板</label>
        <input
          type="text"
          class="form-control form-control-sm font-mono"
          [(ngModel)]="defaultSessionLogFileName"
          placeholder="%H_%S_%Y%M%D_%h%m%s.log"
        />
        <div style="font-size: 12px; color: #495057; margin-top: 4px;">
          宏替换: <code>%H</code>(主机), <code>%S</code>(会话名), <code>%Y%M%D</code>(年月日), <code>%h%m%s</code>(时分秒)
        </div>
      </div>

      <div class="pt-2 border-top d-flex justify-content-between align-items-center" style="border-color: #d0d4dc !important;">
        <span style="font-size: 12px; color: #495057;">
          将上述默认设置批量同步到现有所有配置好的会话。
        </span>
        <button
          class="btn btn-sm btn-outline-primary"
          (click)="applyDefaultSessionToAll()"
        >
          ⚡ 应用到所有已有会话...
        </button>
      </div>
    </div>

    <div class="card mb-3 p-3">
      <h5 class="card-title">会话日志全局策略</h5>

      <div class="form-group mb-3">
        <label class="font-weight-bold">全局日志存储根目录</label>
        <input
          type="text"
          class="form-control font-mono"
          placeholder="~/.tabby-logs"
          [(ngModel)]="logDirectory"
          (change)="saveConfig()"
        />
      </div>

      <div class="form-group mb-3">
        <label class="font-weight-bold">默认日志文件名模板</label>
        <input
          type="text"
          class="form-control font-mono"
          [(ngModel)]="filenameTemplate"
          (change)="saveConfig()"
        />
        <small class="form-text" style="font-size: 12px; color: #495057;">
          宏替换: %H(主机), %S(会话名), %Y%M%D(年月日), %h%m%s(时分秒)
        </small>
      </div>

      <div class="form-group mb-3">
        <label class="font-weight-bold">单日志文件上限 (MB)</label>
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
  constructor(
    private config: ConfigService,
    private sessionConfigService: WorkbenchSessionConfigService,
    @Optional() private notifications?: NotificationsService
  ) {}

  // --- Default Session (SecureCRT Style) ---
  get defaultSession(): DefaultSessionConfig {
    return this.sessionConfigService.getDefaultSessionConfig()
  }

  get defaultSessionEncoding(): WorkbenchEncoding {
    return this.defaultSession.encoding || 'UTF-8'
  }

  set defaultSessionEncoding(val: WorkbenchEncoding) {
    this.sessionConfigService.saveDefaultSessionConfig({ encoding: val })
  }

  get defaultSessionTerminalType(): string {
    return this.defaultSession.terminalType || 'xterm-256color'
  }

  set defaultSessionTerminalType(val: string) {
    this.sessionConfigService.saveDefaultSessionConfig({ terminalType: val })
  }

  get defaultSessionPreferredDock(): 'bottom' | 'right' | 'full' | 'undock' {
    return this.defaultSession.sftp?.preferredDockMode || 'bottom'
  }

  set defaultSessionPreferredDock(val: 'bottom' | 'right' | 'full' | 'undock') {
    this.sessionConfigService.saveDefaultSessionConfig({
      sftp: { preferredDockMode: val, autoOpenSFTP: this.defaultSession.sftp?.autoOpenSFTP ?? false },
    })
  }

  get defaultSessionStartLogUponConnect(): boolean {
    return !!this.defaultSession.logging?.startLogUponConnect
  }

  set defaultSessionStartLogUponConnect(val: boolean) {
    this.sessionConfigService.saveDefaultSessionConfig({
      logging: { ...this.defaultSession.logging, startLogUponConnect: val },
    })
  }

  get defaultSessionPromptForFilename(): boolean {
    return !!this.defaultSession.logging?.promptForFilename
  }

  set defaultSessionPromptForFilename(val: boolean) {
    this.sessionConfigService.saveDefaultSessionConfig({
      logging: { ...this.defaultSession.logging, promptForFilename: val },
    })
  }

  get defaultSessionLogFileName(): string {
    return this.defaultSession.logging?.logFileName || '%H_%S_%Y%M%D_%h%m%s.log'
  }

  set defaultSessionLogFileName(val: string) {
    this.sessionConfigService.saveDefaultSessionConfig({
      logging: { ...this.defaultSession.logging, logFileName: val },
    })
  }

  applyDefaultSessionToAll(): void {
    const profiles = this.config.store?.profiles || []
    if (profiles.length === 0) {
      this.notifications?.info('当前没有保存的会话。')
      return
    }
    const confirmed =
      typeof window !== 'undefined'
        ? window.confirm(
            `确定要将“默认会话配置”应用到所有现有的 ${profiles.length} 个会话吗？\n这将统一会话的编码、日志策略与 SFTP 停靠方式。`
          )
        : true
    if (confirmed) {
      const count = this.sessionConfigService.applyDefaultSessionToAllProfiles(true)
      this.notifications?.info(`已成功将默认配置应用至 ${count} 个会话！`)
    }
  }

  get showTabIndices(): boolean {
    return !!this.config.store?.secureWorkbench?.showTabIndices
  }

  set showTabIndices(val: boolean) {
    this.ensureConfig().showTabIndices = val
  }

  get showTabCloseButton(): boolean {
    return this.config.store?.secureWorkbench?.showTabCloseButton ?? true
  }

  set showTabCloseButton(val: boolean) {
    this.ensureConfig().showTabCloseButton = val
  }

  get hideNativeSFTP(): boolean {
    return !!this.config.store?.secureWorkbench?.hideNativeSFTPButton
  }

  set hideNativeSFTP(val: boolean) {
    this.ensureConfig().hideNativeSFTPButton = val
  }

  get defaultEncoding(): WorkbenchEncoding {
    const encoding = this.sessionConfigService.getSessionConfig(null).encoding
    return encoding && encoding !== 'inherit' ? encoding : 'UTF-8'
  }

  set defaultEncoding(val: WorkbenchEncoding) {
    this.sessionConfigService.saveDefaultSessionConfig({ encoding: val })
  }

  get dockHeight(): number {
    return this.config.store?.secureWorkbench?.dockHeight || 140
  }

  set dockHeight(val: number) {
    this.ensureConfig().dockHeight = Math.max(80, Math.min(800, Number(val) || 140))
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
    document.body.setAttribute('data-hide-tab-indices', (!this.showTabIndices).toString())
    document.body.setAttribute('data-hide-tab-close', (!this.showTabCloseButton).toString())
    this.config.save()
  }
}

@Injectable()
export class WorkbenchSettingsTabProvider extends SettingsTabProvider {
  id = 'secure-workbench'
  icon = 'shield'
  title = 'Secure Workbench'

  getComponentType(): any {
    return WorkbenchSettingsTabComponent
  }
}
