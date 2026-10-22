import {
  Component,
  OnInit,
  OnDestroy,
  HostListener,
  Optional,
  Inject,
  forwardRef,
  ViewChild,
  ViewContainerRef,
  ComponentFactoryResolver,
  ComponentRef,
} from '@angular/core'
import { ConfigService, AppService, NotificationsService } from 'tabby-core'
import { SettingsTabComponent } from 'tabby-settings'
import { Subscription } from 'rxjs'
import { WorkbenchDialogService } from './workbench-dialog.service'
import { WorkbenchHostShellService } from './workbench-host-shell.service'
import {
  DEFAULT_WORKBENCH_CONFIG,
  FrameworkTheme,
  WorkbenchEncoding,
  DefaultSessionConfig,
  DirectoryPair,
  TabContextMenuConfig,
} from '../config/config.model'
import { WorkbenchSessionConfigService } from '../config/workbench-session-config.service'
import { I18nService } from '../i18n/i18n.service'

export interface SettingsNavCategory {
  id: string
  title: string
  iconSvg: string
}

@Component({
  selector: 'workbench-modals',
  template: `
    <!-- 1. Settings Modal Dialog (Split Left-Right Tab Switching Layout) -->
    <div
      *ngIf="showSettings"
      class="workbench-modal-backdrop"
      (click)="closeSettings()"
    >
      <div class="workbench-modal-dialog settings-modal shadow-lg" (click)="$event.stopPropagation()">
        <!-- Header -->
        <div class="modal-header d-flex align-items-center justify-content-between px-3 py-2">
          <div class="d-flex align-items-center gap-2">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" class="text-primary">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            <span class="modal-title font-weight-bold text-dark" style="font-size: 13px;">Secure Workbench 设置</span>
          </div>
          <button class="btn-close-modal" (click)="closeSettings()">&times;</button>
        </div>

        <!-- Body: Left Sidebar + Right Tab View Content -->
        <div class="modal-body-split">
          <!-- Left: Category Navigation (180px) -->
          <div class="settings-nav-sidebar">
            <div
              *ngFor="let cat of categories"
              class="nav-item"
              [class.active]="activeNavId === cat.id"
              (click)="activeNavId = cat.id"
            >
              <span class="nav-icon" [innerHTML]="cat.iconSvg"></span>
              <span class="nav-label">{{ cat.title }}</span>
            </div>
          </div>

          <!-- Right: Tab Switch Content Area (Non-waterfall) -->
          <div class="settings-tab-content">
            <!-- 1. 外观与主题 -->
            <section *ngIf="activeNavId === 'appearance'" class="settings-section">
              <div class="section-header">
                <div class="section-title">外观与主题</div>
                <div class="section-desc">定制工作台整体界面框架的灰阶配色体系与视觉风格。</div>
              </div>

              <div class="form-group mb-3">
                <div class="d-flex justify-content-between align-items-center mb-1">
                  <label class="small font-weight-bold text-dark mb-0">框架配色方案</label>
                  <button class="btn btn-xs btn-outline-primary" style="font-size: 11px; padding: 1px 6px;" (click)="importColorScheme()">
                    + 导入配色方案...
                  </button>
                </div>
                <select class="form-control form-control-sm" [(ngModel)]="frameworkTheme" (change)="saveConfig()">
                  <option value="default">默认工程灰 (清晰高对比)</option>
                  <option value="dark">暗色黑夜 (Dark)</option>
                  <option value="black">纯黑 (Black)</option>
                  <option value="system">跟随系统 (System)</option>
                  <option value="tabby">跟随 Tabby (Tabby Theme)</option>
                  <option *ngFor="let ct of customThemes" [value]="ct.name">自定义: {{ ct.name }}</option>
                </select>
                <small class="form-text mt-1" style="font-size: 12px; color: #475569;">
                  提供默认灰阶、暗色、纯黑，或自动跟随宿主系统与 Tabby 配色。终端配色仍使用当前会话方案。
                </small>
              </div>

              <!-- Session Tree View Settings -->
              <div class="border-top pt-3 mt-3" style="border-color: #cbd5e1 !important;">
                <div class="font-weight-bold text-dark mb-1" style="font-size: 13px;">会话管理器视图</div>
                <div class="mb-2" style="font-size: 12px; color: #475569;">
                  定制会话树抽屉中各类会话来源与根节点层级的展示策略：
                </div>
                <div class="row">
                  <div class="col-6 mb-2">
                    <div class="custom-control custom-switch">
                      <input
                        type="checkbox"
                        class="custom-control-input"
                        id="modalShowImportedSessions"
                        [(ngModel)]="showImportedSessions"
                        (change)="saveConfig()"
                      />
                      <label class="custom-control-label small" style="color: #1e293b; font-weight: 500;" for="modalShowImportedSessions">
                        显示导入会话 (.ssh/config)
                      </label>
                    </div>
                  </div>
                  <div class="col-6 mb-2">
                    <div class="custom-control custom-switch">
                      <input
                        type="checkbox"
                        class="custom-control-input"
                        id="modalShowBuiltinSessions"
                        [(ngModel)]="showBuiltinSessions"
                        (change)="saveConfig()"
                      />
                      <label class="custom-control-label small" style="color: #1e293b; font-weight: 500;" for="modalShowBuiltinSessions">
                        显示内置终端 (Built-in)
                      </label>
                    </div>
                  </div>
                  <div class="col-12 mb-2">
                    <div class="custom-control custom-switch">
                      <input
                        type="checkbox"
                        class="custom-control-input"
                        id="modalHideSavedRootWhenSole"
                        [(ngModel)]="hideSavedRootWhenSole"
                        (change)="saveConfig()"
                      />
                      <label class="custom-control-label small" style="color: #1e293b; font-weight: 500;" for="modalHideSavedRootWhenSole">
                        仅有自建会话时隐藏根目录 (扁平化直接展示所有目录与会话)
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <!-- 2. 界面语言 -->
            <section *ngIf="activeNavId === 'language'" class="settings-section">
              <div class="section-header">
                <div class="section-title">界面语言 (Language)</div>
                <div class="section-desc">选择工作台界面显示语言，支持社区扩展翻译字典。</div>
              </div>

              <div class="form-group mb-3">
                <label class="small font-weight-bold text-dark mb-1">语言偏好</label>
                <select class="form-control form-control-sm" [(ngModel)]="uiLanguage" (change)="saveConfig()">
                  <option value="auto">自动识别 (Auto Detect)</option>
                  <option value="zh-CN">简体中文 (Simplified Chinese)</option>
                  <option value="en-US">English (英语)</option>
                  <option value="tabby">跟随 Tabby (Host Language)</option>
                </select>
              </div>

              <div class="card p-3 bg-light border" style="border-color: #cbd5e1 !important;">
                <div class="small font-weight-bold text-dark mb-1">社区翻译扩展指南</div>
                <div style="font-size: 12px; color: #475569; line-height: 1.5;">
                  Tabby Secure Workbench 已内置模块化 i18n 架构。社区开发者只需在插件 <code>src/i18n/locales/</code> 目录下添加新的翻译字典，并在 <code>I18nService</code> 中调用 <code>registerLocale('xx-XX', dict)</code> 即可无缝扩展第三方语言包。详见仓库 <code>TRANSLATING.md</code>。
                </div>
              </div>
            </section>

            <!-- 3. 标签栏与窗口 -->
            <section *ngIf="activeNavId === 'tabs'" class="settings-section">
              <div class="section-header">
                <div class="section-title">标签栏与窗口控制</div>
                <div class="section-desc">配置主工作区标签页的外观显示与右键上下文菜单项。</div>
              </div>

              <div class="row mb-3">
                <div class="col-6">
                  <label class="small font-weight-bold text-dark mb-1">标签页序号</label>
                  <div class="custom-control custom-switch">
                    <input
                      type="checkbox"
                      class="custom-control-input"
                      id="modalShowTabIndices"
                      [(ngModel)]="showTabIndices"
                      (change)="saveConfig()"
                    />
                    <label class="custom-control-label small" style="color: #1e293b; font-weight: 500;" for="modalShowTabIndices">
                      显示序号 (1, 2...)
                    </label>
                  </div>
                </div>
                <div class="col-6">
                  <label class="small font-weight-bold text-dark mb-1">标签页关闭按钮</label>
                  <div class="custom-control custom-switch">
                    <input
                      type="checkbox"
                      class="custom-control-input"
                      id="modalAlwaysShowTabClose"
                      [(ngModel)]="alwaysShowTabCloseButton"
                      (change)="saveConfig()"
                    />
                    <label class="custom-control-label small" style="color: #1e293b; font-weight: 500;" for="modalAlwaysShowTabClose">
                      常驻显示关闭按钮 (取消勾选则悬停显示)
                    </label>
                  </div>
                </div>
              </div>

              <!-- Tab Context Menu Customization (All 16 Native Items) -->
              <div class="card p-3 bg-light border mb-3" style="border-color: #cbd5e1 !important;">
                <div class="small font-weight-bold text-dark mb-1">标签页右键菜单自定义</div>
                <div class="mb-2" style="font-size: 12px; color: #475569;">
                  勾选需要在标签页右键菜单中显示的菜单项，未勾选的项将被自动过滤隐藏：
                </div>
                <div class="row">
                  <div class="col-6 mb-2" *ngFor="let item of tabContextMenuList">
                    <div class="custom-control custom-switch">
                      <input
                        type="checkbox"
                        class="custom-control-input"
                        [id]="'tabCtx_' + item.key"
                        [(ngModel)]="tabContextMenu[item.key]"
                        (change)="saveConfig()"
                      />
                      <label class="custom-control-label small" style="color: #1e293b; font-weight: 500;" [for]="'tabCtx_' + item.key">
                        {{ item.label }}
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <!-- 4. 默认会话配置 (Merged Terminal & Codec + SecureCRT Full Logging + SFTP Dock) -->
            <section *ngIf="activeNavId === 'default-session'" class="settings-section">
              <div class="section-header d-flex justify-content-between align-items-center">
                <div>
                  <div class="section-title d-flex align-items-center gap-2" style="color: #0f172a !important;">
                    <span>默认会话配置</span>
                    <span style="font-size: 12px; padding: 2px 8px; background: #e0e7ff; color: #1e40af; border-radius: 4px; font-weight: 600;">SecureCRT 核心特性</span>
                  </div>
                  <div class="section-desc" style="font-size: 12px; color: #475569;">
                    统一配置新建会话的继承参数；支持一键将默认参数批量同步至现有全部会话。
                  </div>
                </div>
              </div>

              <div class="card p-3 bg-light border mb-3" style="border-color: #cbd5e1 !important;">
                <!-- 1. Terminal Emulation & Encoding -->
                <div class="row mb-3">
                  <div class="col-6">
                    <label class="small font-weight-bold text-dark mb-1">终端仿真类型 (Terminal Emulation)</label>
                    <select
                      class="form-control form-control-sm"
                      [ngModel]="defaultSession.terminalType"
                      (ngModelChange)="defaultSessionTerminalType = $event"
                    >
                      <option value="xterm-256color">xterm-256color (推荐/标准)</option>
                      <option value="xterm">xterm</option>
                      <option value="vt100">vt100</option>
                      <option value="vt102">vt102</option>
                      <option value="vt220">vt220</option>
                      <option value="ansi">ANSI</option>
                      <option value="linux">Linux Console</option>
                    </select>
                  </div>
                  <div class="col-6">
                    <label class="small font-weight-bold text-dark mb-1">会话默认编码</label>
                    <select
                      class="form-control form-control-sm"
                      [ngModel]="defaultSession.encoding"
                      (ngModelChange)="defaultSessionEncoding = $event"
                    >
                      <option value="UTF-8">UTF-8 (推荐/通用)</option>
                      <option value="GBK">GBK (简体中文常用)</option>
                      <option value="GB2312">GB2312</option>
                      <option value="GB18030">GB18030</option>
                      <option value="BIG5">BIG5 (繁体中文)</option>
                    </select>
                  </div>
                </div>

                <!-- 2. SFTP Dock -->
                <div class="form-group mb-3">
                  <label class="small font-weight-bold text-dark mb-1">默认 SFTP 停靠布局</label>
                  <select
                    class="form-control form-control-sm"
                    [ngModel]="defaultSession.sftp.preferredDockMode"
                    (ngModelChange)="defaultSessionPreferredDock = $event"
                  >
                    <option value="bottom">停靠在终端下方 (Bottom)</option>
                    <option value="right">停靠在终端右侧 (Right 50/50)</option>
                    <option value="full">铺满独立标签页 (Full Tab)</option>
                    <option value="undock">弹出悬浮窗口 (Undock)</option>
                  </select>
                </div>

                <!-- 3. SecureCRT Full Logging Policy -->
                <div class="border-top pt-2 mt-2" style="border-color: #cbd5e1 !important;">
                  <div class="font-weight-bold text-dark mb-2" style="font-size: 13px;">会话日志策略 (SecureCRT 规范)</div>

                  <div class="row mb-2">
                    <div class="col-6">
                      <div class="custom-control custom-switch mb-1">
                        <input
                          type="checkbox"
                          class="custom-control-input"
                          id="defStartLog"
                          [ngModel]="defaultSession.logging.startLogUponConnect"
                          (ngModelChange)="defaultSessionStartLogUponConnect = $event"
                        />
                        <label class="custom-control-label small" style="color: #1e293b; font-weight: 500;" for="defStartLog">
                          连接成功后自动启动会话日志记录
                        </label>
                      </div>
                    </div>
                    <div class="col-6">
                      <div class="custom-control custom-switch mb-1">
                        <input
                          type="checkbox"
                          class="custom-control-input"
                          id="defPromptLog"
                          [ngModel]="defaultSession.logging.promptForFilename"
                          (ngModelChange)="defaultSessionPromptForFilename = $event"
                        />
                        <label class="custom-control-label small" style="color: #1e293b; font-weight: 500;" for="defPromptLog">
                          启动日志时提示确认文件名
                        </label>
                      </div>
                    </div>
                  </div>

                  <div class="form-group mb-2">
                    <label class="small font-weight-bold text-dark mb-1">默认日志文件名模板</label>
                    <input
                      type="text"
                      class="form-control form-control-sm font-mono"
                      [ngModel]="defaultSession.logging.logFileName"
                      (ngModelChange)="defaultSessionLogFileName = $event"
                      placeholder="%H_%S_%Y%M%D_%h%m%s.log"
                    />
                    <div style="font-size: 12px; color: #475569; margin-top: 3px;">
                      可用宏替换: <code>%H</code>(主机), <code>%S</code>(会话名), <code>%U</code>(用户名), <code>%Y%M%D</code>(年月日), <code>%h%m%s</code>(时分秒)
                    </div>
                  </div>

                  <div class="row mb-2">
                    <div class="col-6">
                      <label class="small font-weight-bold text-dark mb-1">目标文件已存在时的操作</label>
                      <select
                        class="form-control form-control-sm"
                        [ngModel]="defaultSession.logging.appendMode || 'append'"
                        (ngModelChange)="defaultSessionAppendMode = $event"
                      >
                        <option value="append">追加写入现有文件 (Append)</option>
                        <option value="overwrite">覆盖并清空现有文件 (Overwrite)</option>
                      </select>
                    </div>
                    <div class="col-6">
                      <label class="small font-weight-bold text-dark mb-1">日志存储根目录</label>
                      <input
                        type="text"
                        class="form-control form-control-sm font-mono"
                        placeholder="~/.tabby-logs"
                        [(ngModel)]="logDirectory"
                        (change)="saveConfig()"
                      />
                    </div>
                  </div>

                  <div class="row mb-2">
                    <div class="col-6">
                      <div class="custom-control custom-switch mb-1">
                        <input
                          type="checkbox"
                          class="custom-control-input"
                          id="defMidnightLog"
                          [ngModel]="defaultSession.logging.startNewLogAtMidnight"
                          (ngModelChange)="defaultSessionStartNewLogAtMidnight = $event"
                        />
                        <label class="custom-control-label small" style="color: #1e293b; font-weight: 500;" for="defMidnightLog">
                          每日午夜自动创建新日志文件
                        </label>
                      </div>
                    </div>
                    <div class="col-6">
                      <div class="custom-control custom-switch mb-1">
                        <input
                          type="checkbox"
                          class="custom-control-input"
                          id="defTimestampEachLine"
                          [ngModel]="defaultSession.logging.timestampEachLine"
                          (ngModelChange)="defaultSessionTimestampEachLine = $event"
                        />
                        <label class="custom-control-label small" style="color: #1e293b; font-weight: 500;" for="defTimestampEachLine">
                          每行自动附加时间戳前缀
                        </label>
                      </div>
                    </div>
                    <div class="col-6">
                      <div class="custom-control custom-switch mb-1">
                        <input
                          type="checkbox"
                          class="custom-control-input"
                          id="defRawLog"
                          [ngModel]="defaultSession.logging.mode === 'raw'"
                          (ngModelChange)="defaultSessionRawLog = $event"
                        />
                        <label class="custom-control-label small" style="color: #1e293b; font-weight: 500;" for="defRawLog">
                          记录原始控制码与字节流 (Raw Log)
                        </label>
                      </div>
                    </div>
                    <div class="col-6">
                      <div class="d-flex align-items-center gap-2">
                        <label class="small font-weight-bold text-dark mb-0" style="white-space: nowrap;">单文件上限 (MB):</label>
                        <input
                          type="number"
                          class="form-control form-control-sm"
                          style="width: 80px;"
                          [(ngModel)]="maxFileSizeMB"
                          (change)="saveConfig()"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Batch Apply Action -->
                <div class="pt-2 border-top mt-2 d-flex justify-content-between align-items-center" style="border-color: #cbd5e1 !important;">
                  <span style="font-size: 12px; color: #475569;">
                    将上述默认设置批量同步到现有所有配置好的会话。
                  </span>
                  <button
                    class="btn btn-sm"
                    style="color: #1e40af; border: 1px solid #1e40af; background: #eff6ff; font-weight: 600; font-size: 12px;"
                    (click)="applyDefaultSessionToAll()"
                    title="将当前默认会话配置应用到现有全部会话"
                  >
                    ⚡ 应用到所有已有会话...
                  </button>
                </div>
              </div>
            </section>

            <!-- 5. 文件传输 (SFTP) (Merged SFTP+ Options) -->
            <section *ngIf="activeNavId === 'file-transfer'" class="settings-section">
              <div class="section-header">
                <div class="section-title">{{ t('settings.fileTransfer', '文件传输 (SFTP)') }}</div>
                <div class="section-desc">{{ t('settings.fileTransferDesc', '整合 SFTP+ 高级配置，管理路径记忆模式、冲突处理与传输队列。') }}</div>
              </div>

              <div class="card p-3 bg-light border mb-3" style="border-color: #cbd5e1 !important;">
                <div class="row mb-2">
                  <div class="col-6">
                    <label class="small font-weight-bold text-dark mb-1">{{ t('settings.defaultLocalPath', '默认本地起始路径') }}</label>
                    <input
                      type="text"
                      class="form-control form-control-sm font-mono"
                      placeholder="留空则使用用户主目录"
                      [(ngModel)]="fileTransfer.defaultLocalPath"
                      (change)="saveConfig()"
                    />
                  </div>
                  <div class="col-6">
                    <label class="small font-weight-bold text-dark mb-1">{{ t('settings.defaultRemotePath', '默认远程起始路径') }}</label>
                    <input
                      type="text"
                      class="form-control form-control-sm font-mono"
                      placeholder="留空则进入登录用户主目录"
                      [(ngModel)]="fileTransfer.defaultRemotePath"
                      (change)="saveConfig()"
                    />
                  </div>
                </div>

                <div class="row mb-2">
                  <div class="col-6">
                    <label class="small font-weight-bold text-dark mb-1">{{ t('settings.pathMode', '路径模式') }}</label>
                    <select
                      class="form-control form-control-sm"
                      [(ngModel)]="fileTransfer.pathMode"
                      (change)="saveConfig()"
                    >
                      <option value="remember">自动记忆各会话上次浏览路径 (推荐)</option>
                      <option value="sync">与终端工作目录同步 (Sync)</option>
                      <option value="off">不记忆 (每次均使用默认起始路径)</option>
                    </select>
                  </div>
                  <div class="col-6">
                    <label class="small font-weight-bold text-dark mb-1">{{ t('settings.conflictAction', '文件传输冲突处理策略') }}</label>
                    <select
                      class="form-control form-control-sm"
                      [(ngModel)]="fileTransfer.conflictAction"
                      (change)="saveConfig()"
                    >
                      <option value="prompt">弹出提示询问处理方式 (推荐)</option>
                      <option value="overwrite">直接原子覆盖目标文件</option>
                      <option value="skip">自动跳过冲突文件</option>
                    </select>
                  </div>
                </div>

                <div class="row mb-2">
                  <div class="col-6">
                    <label class="small font-weight-bold text-dark mb-1">{{ t('settings.doubleClickAction', '双击文件动作') }}</label>
                    <select
                      class="form-control form-control-sm"
                      [(ngModel)]="fileTransfer.doubleClickAction"
                      (change)="saveConfig()"
                    >
                      <option value="view">内置查看器打开文本/图片</option>
                      <option value="transfer">立即下载或上传传输</option>
                    </select>
                  </div>
                  <div class="col-6">
                    <label class="small font-weight-bold text-dark mb-1">最大并发传输任务数</label>
                    <input
                      type="number"
                      class="form-control form-control-sm"
                      min="1"
                      max="10"
                      [(ngModel)]="fileTransfer.maxConcurrentTransfers"
                      (change)="saveConfig()"
                    />
                  </div>
                </div>

                <div class="row mb-2">
                  <div class="col-6">
                    <div class="custom-control custom-switch mb-1">
                      <input
                        type="checkbox"
                        class="custom-control-input"
                        id="ftShowHidden"
                        [(ngModel)]="fileTransfer.showHiddenFiles"
                        (change)="saveConfig()"
                      />
                      <label class="custom-control-label small" style="color: #1e293b; font-weight: 500;" for="ftShowHidden">
                        默认显示隐藏文件与点文件 (.)
                      </label>
                    </div>
                  </div>
                  <div class="col-6">
                    <div class="custom-control custom-switch mb-1">
                      <input
                        type="checkbox"
                        class="custom-control-input"
                        id="ftConfirmDelete"
                        [(ngModel)]="fileTransfer.confirmDelete"
                        (change)="saveConfig()"
                      />
                      <label class="custom-control-label small" style="color: #1e293b; font-weight: 500;" for="ftConfirmDelete">
                        删除远程/本地项目前进行二次确认
                      </label>
                    </div>
                  </div>
                </div>

                <div class="row mb-2">
                  <div class="col-6">
                    <label class="small font-weight-bold text-dark mb-1">底部传输队列抽屉高度 (px)</label>
                    <input
                      type="number"
                      class="form-control form-control-sm"
                      [(ngModel)]="dockHeight"
                      (change)="saveConfig()"
                    />
                  </div>
                  <div class="col-6 d-flex align-items-center pt-3">
                    <div class="custom-control custom-switch mb-1">
                      <input
                        type="checkbox"
                        class="custom-control-input"
                        id="autoExpandDock"
                        [(ngModel)]="autoExpandDock"
                        (change)="saveConfig()"
                      />
                      <label class="custom-control-label small" style="color: #1e293b; font-weight: 500;" for="autoExpandDock">
                        有传输任务时自动展开底部队列
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <!-- 6. 侧边栏与启动 (Sidebar & Startup) -->
            <section *ngIf="activeNavId === 'sidebar-startup'" class="settings-section">
              <div class="section-header">
                <div class="section-title">侧边栏与启动偏好</div>
                <div class="section-desc">配置左侧活动栏常驻功能项以及应用启动时的默认窗口状态。</div>
              </div>

              <div class="card p-3 bg-light border mb-3" style="border-color: #cbd5e1 !important;">
                <div class="font-weight-bold text-dark mb-2" style="font-size: 13px;">侧边栏活动项可见性</div>
                <div class="row mb-3">
                  <div class="col-4">
                    <div class="custom-control custom-switch">
                      <input
                        type="checkbox"
                        class="custom-control-input"
                        id="sbShowSessions"
                        [(ngModel)]="sidebarVisibility.sessions"
                        (change)="saveConfig()"
                      />
                      <label class="custom-control-label small" style="color: #1e293b; font-weight: 500;" for="sbShowSessions">
                        会话管理器
                      </label>
                    </div>
                  </div>
                  <div class="col-4">
                    <div class="custom-control custom-switch">
                      <input
                        type="checkbox"
                        class="custom-control-input"
                        id="sbShowCommands"
                        [(ngModel)]="sidebarVisibility.commands"
                        (change)="saveConfig()"
                      />
                      <label class="custom-control-label small" style="color: #1e293b; font-weight: 500;" for="sbShowCommands">
                        常用命令库
                      </label>
                    </div>
                  </div>
                  <div class="col-4">
                    <div class="custom-control custom-switch">
                      <input
                        type="checkbox"
                        class="custom-control-input"
                        id="sbShowSftp"
                        [(ngModel)]="sidebarVisibility.sftp"
                        (change)="saveConfig()"
                      />
                      <label class="custom-control-label small" style="color: #1e293b; font-weight: 500;" for="sbShowSftp">
                        {{ t('settings.showSftp', '文件传输 (SFTP)') }}
                      </label>
                    </div>
                  </div>
                </div>

                <div class="border-top pt-2 mt-2" style="border-color: #cbd5e1 !important;">
                  <div class="font-weight-bold text-dark mb-2" style="font-size: 13px;">启动与窗口行为</div>
                  <div class="row">
                    <div class="col-6">
                      <div class="custom-control custom-switch mb-2">
                        <input
                          type="checkbox"
                          class="custom-control-input"
                          id="stMaximize"
                          [(ngModel)]="startupConfig.maximizeOnStartup"
                          (change)="saveConfig()"
                        />
                        <label class="custom-control-label small" style="color: #1e293b; font-weight: 500;" for="stMaximize">
                          启动后自动最大化窗口
                        </label>
                      </div>
                    </div>
                    <div class="col-6">
                      <div class="custom-control custom-switch mb-2">
                        <input
                          type="checkbox"
                          class="custom-control-input"
                          id="stOpenSidebar"
                          [(ngModel)]="startupConfig.openSidebarOnStartup"
                          (change)="saveConfig()"
                        />
                        <label class="custom-control-label small" style="color: #1e293b; font-weight: 500;" for="stOpenSidebar">
                          启动时自动展开侧边栏抽屉
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <!-- 7. 高级与原生设置 -->
            <section *ngIf="activeNavId === 'advanced'" class="settings-section">
              <div class="section-header">
                <div class="section-title">高级与原生设置</div>
                <div class="section-desc">快速打开 Tabby 原生完整系统设置弹出窗口。</div>
              </div>

              <div class="pt-2">
                <button class="btn btn-sm btn-outline-secondary btn-block" (click)="openNativeSettings()">
                  ⚙ 打开 Tabby 原生完整系统设置...
                </button>
              </div>
            </section>
          </div>
        </div>

        <!-- Footer -->
        <div class="modal-footer d-flex justify-content-end px-3 py-2">
          <button class="btn btn-sm btn-primary px-3" (click)="closeSettings()">完成</button>
        </div>
      </div>
    </div>

    <!-- 2. About Modal Dialog -->
    <div
      *ngIf="showAbout"
      class="workbench-modal-backdrop"
      (click)="closeAbout()"
    >
      <div class="workbench-modal-dialog about-modal shadow-lg" (click)="$event.stopPropagation()">
        <!-- Header -->
        <div class="modal-header d-flex align-items-center justify-content-between px-3 py-2">
          <div class="d-flex align-items-center gap-2">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" class="text-info">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span class="modal-title font-weight-bold text-dark" style="font-size: 13px;">关于 Tabby Secure Workbench</span>
          </div>
          <button class="btn-close-modal" (click)="closeAbout()">&times;</button>
        </div>

        <!-- Body -->
        <div class="modal-body p-3">
          <div class="text-center mb-3">
            <h5 class="font-weight-bold text-dark mb-1">Tabby Secure Workbench</h5>
            <span class="badge badge-primary font-mono" style="font-size: 11px;">v1.0.0</span>
            <span class="badge badge-secondary ml-1" style="font-size: 11px;">MIT License</span>
          </div>

          <p class="small text-secondary mb-3 text-justify">
            A professional SSH workbench plugin for Tabby inspired by SecureCRT, featuring Session Manager tree, Command Manager, Stateful Codec, per-tab transfer queues, verified session logging, and cross-connection transfer.
          </p>

          <div class="card p-2 bg-light border-0 rounded small mb-2">
            <div class="font-weight-bold text-dark mb-1">开源组件与致谢:</div>
            <ul class="mb-0 pl-3 text-muted">
              <li>Tabby SFTP+ (MIT, Copyright DD1024z)</li>
              <li>Tabby Core & Terminal (MIT, Copyright Eugeny Pankov)</li>
            </ul>
          </div>
        </div>

        <!-- Footer -->
        <div class="modal-footer d-flex justify-content-end px-3 py-2">
          <button class="btn btn-sm btn-primary px-3" (click)="closeAbout()">确定</button>
        </div>
      </div>
    </div>

    <!-- 3. Native Tabby Settings Modal Dialog (Popup) -->
    <div
      *ngIf="showNativeSettings"
      class="workbench-modal-backdrop"
      (click)="closeNativeSettings()"
    >
      <div class="workbench-modal-dialog native-settings-modal shadow-lg" (click)="$event.stopPropagation()">
        <!-- Header -->
        <div class="modal-header d-flex align-items-center justify-content-between px-3 py-2">
          <div class="d-flex align-items-center gap-2">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" class="text-secondary">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            <span class="modal-title font-weight-bold text-dark" style="font-size: 13px;">Tabby 系统完整设置</span>
          </div>
          <button class="btn-close-modal" (click)="closeNativeSettings()">&times;</button>
        </div>

        <!-- Host Container for Tabby's Native SettingsTabComponent -->
        <div class="native-settings-body">
          <ng-template #nativeSettingsHost></ng-template>
        </div>

        <!-- Footer -->
        <div class="modal-footer d-flex justify-content-end px-3 py-2">
          <button class="btn btn-sm btn-primary px-3" (click)="closeNativeSettings()">关闭</button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .workbench-modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.45);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 50000;
        user-select: none;
      }
      .workbench-modal-dialog {
        background: #ffffff;
        border: 1px solid #d0d4dc;
        border-radius: 6px;
        color: #222222;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      .settings-modal {
        width: 780px;
        max-width: 95vw;
        height: 560px;
        max-height: 90vh;
      }
      .about-modal {
        width: 440px;
        max-width: 90vw;
      }
      .native-settings-modal {
        width: 880px;
        max-width: 95vw;
        height: 640px;
        max-height: 90vh;
      }
      .native-settings-body {
        flex: 1 1 auto;
        overflow: hidden;
        position: relative;
        display: flex;
        flex-direction: column;
        background: #ffffff;
      }
      .native-settings-body > * {
        flex: 1 1 auto;
        height: 100%;
        min-height: 0;
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

      /* Split Layout */
      .modal-body-split {
        display: flex;
        flex: 1 1 auto;
        height: calc(100% - 82px);
        overflow: hidden;
      }

      /* Left Navigation Sidebar */
      .settings-nav-sidebar {
        width: 180px;
        min-width: 180px;
        max-width: 180px;
        background: #f0f2f5;
        border-right: 1px solid #d0d4dc;
        display: flex;
        flex-direction: column;
        padding: 8px 0;
        overflow-y: auto;
        flex-shrink: 0;
      }
      .nav-item {
        padding: 8px 14px;
        font-size: 12px;
        color: #444444;
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        border-left: 3px solid transparent;
        transition: all 0.15s ease;
      }
      .nav-item:hover {
        background: #e4e7eb;
        color: #000000;
      }
      .nav-item.active {
        background: rgba(30, 112, 191, 0.12);
        color: #1e70bf;
        font-weight: 600;
        border-left-color: #1e70bf;
      }
      .nav-icon {
        display: inline-flex;
        align-items: center;
        opacity: 0.85;
      }

      /* Right Tab Content Area */
      .settings-tab-content {
        flex: 1 1 auto;
        overflow-y: auto;
        padding: 16px 20px;
      }
      .settings-section {
        margin-bottom: 20px;
      }
      .section-header {
        margin-bottom: 12px;
      }
      .section-title {
        font-size: 13px;
        font-weight: 700;
        color: #111111;
        margin-bottom: 2px;
      }
      .section-desc {
        font-size: 12px;
        color: #495057;
      }

      .form-control {
        background: #ffffff !important;
        border: 1px solid #d0d4dc !important;
        color: #222222 !important;
      }
      .form-control:focus {
        border-color: #1e70bf !important;
        box-shadow: 0 0 0 2px rgba(30, 112, 191, 0.15) !important;
      }

      /* Card & Control High-Contrast Styling for WCAG AA */
      .settings-modal .card,
      .card {
        background-color: #f8fafc !important;
        border: 1px solid #d0d4dc !important;
        color: #1e293b !important;
        border-radius: 6px !important;
      }
      .card .text-dark,
      .card label {
        color: #1e293b !important;
      }
      .card .custom-control-label {
        color: #334155 !important;
        font-weight: 500;
      }
      .card code {
        background: #e2e8f0;
        color: #0f172a;
        padding: 1px 4px;
        border-radius: 3px;
      }
    `,
  ],
})
export class WorkbenchModalsComponent implements OnInit, OnDestroy {
  showSettings = false
  showAbout = false
  showNativeSettings = false
  activeNavId = 'appearance'
  private subs: Subscription[] = []

  private _nativeSettingsHost?: ViewContainerRef
  private nativeSettingsRef?: ComponentRef<SettingsTabComponent>

  @ViewChild('nativeSettingsHost', { read: ViewContainerRef })
  set nativeSettingsHost(vcr: ViewContainerRef | undefined) {
    if (vcr && this.showNativeSettings && !this.nativeSettingsRef) {
      this._nativeSettingsHost = vcr
      try {
        const factory = this.cfr.resolveComponentFactory(SettingsTabComponent)
        this.nativeSettingsRef = vcr.createComponent(factory)
      } catch (e) {
        console.warn('Could not mount SettingsTabComponent dynamically:', e)
      }
    }
  }

  categories: SettingsNavCategory[] = [
    {
      id: 'appearance',
      title: '外观与主题',
      iconSvg: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 0 0 20z"/></svg>',
    },
    {
      id: 'language',
      title: '界面语言',
      iconSvg: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    },
    {
      id: 'tabs',
      title: '标签栏与窗口',
      iconSvg: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>',
    },
    {
      id: 'default-session',
      title: '默认会话配置',
      iconSvg: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    },
    {
      id: 'file-transfer',
      title: '文件传输 (SFTP)',
      iconSvg: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
    },
    {
      id: 'sidebar-startup',
      title: '侧边栏与启动',
      iconSvg: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>',
    },
    {
      id: 'advanced',
      title: '高级与原生设置',
      iconSvg: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    },
  ]

  constructor(
    public dialogService: WorkbenchDialogService,
    private config: ConfigService,
    private app: AppService,
    @Optional() private cfr?: ComponentFactoryResolver,
    @Optional() private sessionConfigService?: WorkbenchSessionConfigService,
    @Optional() private notifications?: NotificationsService,
    @Optional() @Inject(forwardRef(() => WorkbenchHostShellService)) private hostShell?: WorkbenchHostShellService,
    @Optional() public i18n?: I18nService
  ) {}

  t(path: string, fallback?: string): string {
    return this.i18n?.t(path, fallback) || fallback || path
  }

  ngOnInit(): void {
    const fileNav = this.categories.find(item => item.id === 'file-transfer')
    if (fileNav) fileNav.title = this.t('settings.fileTransfer', fileNav.title)
    this.subs.push(
      this.dialogService.showSettings$.subscribe((val) => {
        this.showSettings = val
      }),
      this.dialogService.showAbout$.subscribe((val) => {
        this.showAbout = val
      }),
      this.dialogService.showNativeSettings$.subscribe((val) => {
        this.showNativeSettings = val
        if (!val) {
          if (this.nativeSettingsRef) {
            this.nativeSettingsRef.destroy()
            this.nativeSettingsRef = undefined
          }
          if (this._nativeSettingsHost) {
            this._nativeSettingsHost.clear()
          }
          this.hostShell?.ensureWorkbenchShellActive()
        }
      })
    )
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe())
    if (this.nativeSettingsRef) {
      this.nativeSettingsRef.destroy()
      this.nativeSettingsRef = undefined
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showSettings || this.showAbout || this.showNativeSettings) {
      this.dialogService.closeAll()
    }
  }

  closeSettings(): void {
    this.dialogService.closeSettings()
  }

  closeAbout(): void {
    this.dialogService.closeAbout()
  }

  openNativeSettings(): void {
    this.closeSettings()
    this.dialogService.openNativeSettings()
  }

  closeNativeSettings(): void {
    this.dialogService.closeNativeSettings()
    if (this.nativeSettingsRef) {
      this.nativeSettingsRef.destroy()
      this.nativeSettingsRef = undefined
    }
    if (this._nativeSettingsHost) {
      this._nativeSettingsHost.clear()
    }
    this.hostShell?.ensureWorkbenchShellActive()
  }

  // --- Settings getters & setters ---
  get frameworkTheme(): FrameworkTheme {
    return this.config.store?.secureWorkbench?.frameworkTheme || 'securecrt'
  }

  set frameworkTheme(val: FrameworkTheme) {
    this.ensureConfig().frameworkTheme = val
    if (typeof document !== 'undefined') {
      document.body.setAttribute('data-framework-theme', val || 'securecrt')
    }
  }

  get showTabIndices(): boolean {
    return !!this.config.store?.secureWorkbench?.showTabIndices
  }

  set showTabIndices(val: boolean) {
    this.ensureConfig().showTabIndices = val
    if (typeof document !== 'undefined') {
      document.body.setAttribute('data-hide-tab-indices', (!val).toString())
    }
  }

  get showTabCloseButton(): boolean {
    return this.config.store?.secureWorkbench?.showTabCloseButton ?? true
  }

  set showTabCloseButton(val: boolean) {
    this.ensureConfig().showTabCloseButton = val
    if (typeof document !== 'undefined') {
      document.body.setAttribute('data-hide-tab-close', (!val).toString())
    }
  }

  get showImportedSessions(): boolean {
    return this.config.store?.secureWorkbench?.showImportedSessions ?? true
  }

  set showImportedSessions(val: boolean) {
    this.ensureConfig().showImportedSessions = val
  }

  get showBuiltinSessions(): boolean {
    return !!this.config.store?.secureWorkbench?.showBuiltinSessions
  }

  set showBuiltinSessions(val: boolean) {
    this.ensureConfig().showBuiltinSessions = val
  }

  get hideSavedRootWhenSole(): boolean {
    return this.config.store?.secureWorkbench?.hideSavedRootWhenSole ?? true
  }

  set hideSavedRootWhenSole(val: boolean) {
    this.ensureConfig().hideSavedRootWhenSole = val
  }

  get hideNativeSFTP(): boolean {
    return !!this.config.store?.secureWorkbench?.hideNativeSFTPButton
  }

  set hideNativeSFTP(val: boolean) {
    this.ensureConfig().hideNativeSFTPButton = val
  }

  get tabContextMenu(): TabContextMenuConfig {
    const cfg = this.ensureConfig()
    if (!cfg.tabContextMenu) {
      cfg.tabContextMenu = { ...DEFAULT_WORKBENCH_CONFIG.tabContextMenu }
    }
    return cfg.tabContextMenu
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
    this.ensureConfig().dockHeight = Math.max(80, Math.min(800, Number(val) || 140))
  }

  get autoExpandDock(): boolean {
    return this.config.store?.secureWorkbench?.autoExpandDockOnRunning ?? true
  }

  set autoExpandDock(val: boolean) {
    this.ensureConfig().autoExpandDockOnRunning = val
  }

  get logDirectory(): string {
    return this.config.store?.secureWorkbench?.logging?.directory || ''
  }

  set logDirectory(val: string) {
    this.ensureConfig().logging.directory = val
  }

  get maxFileSizeMB(): number {
    return this.config.store?.secureWorkbench?.logging?.maxFileSizeMB || 50
  }

  set maxFileSizeMB(val: number) {
    this.ensureConfig().logging.maxFileSizeMB = val || 50
  }

  // --- Default Session (SecureCRT Style) ---
  get defaultSession(): DefaultSessionConfig {
    return this.sessionConfigService?.getDefaultSessionConfig() || ({} as any)
  }

  set defaultSessionEncoding(val: WorkbenchEncoding) {
    this.sessionConfigService?.saveDefaultSessionConfig({ encoding: val })
  }

  set defaultSessionTerminalType(val: string) {
    this.sessionConfigService?.saveDefaultSessionConfig({ terminalType: val })
  }

  set defaultSessionPreferredDock(val: 'bottom' | 'right' | 'full' | 'undock') {
    this.sessionConfigService?.saveDefaultSessionConfig({
      sftp: { preferredDockMode: val, autoOpenSFTP: this.defaultSession.sftp?.autoOpenSFTP ?? false },
    })
  }

  set defaultSessionAutoOpenSFTP(val: boolean) {
    this.sessionConfigService?.saveDefaultSessionConfig({
      sftp: { preferredDockMode: this.defaultSession.sftp?.preferredDockMode || 'bottom', autoOpenSFTP: val },
    })
  }

  set defaultSessionStartLogUponConnect(val: boolean) {
    this.sessionConfigService?.saveDefaultSessionConfig({
      logging: { ...this.defaultSession.logging, startLogUponConnect: val },
    })
  }

  set defaultSessionPromptForFilename(val: boolean) {
    this.sessionConfigService?.saveDefaultSessionConfig({
      logging: { ...this.defaultSession.logging, promptForFilename: val },
    })
  }

  set defaultSessionLogFileName(val: string) {
    this.sessionConfigService?.saveDefaultSessionConfig({
      logging: { ...this.defaultSession.logging, logFileName: val },
    })
  }

  tabContextMenuList = [
    { key: 'duplicate', label: '复制标签页 (Duplicate)' },
    { key: 'restart', label: '重新连接 / 重启 (Reconnect)' },
    { key: 'rename', label: '重命名标签页 (Rename)' },
    { key: 'pin', label: '固定标签页 (Pin)' },
    { key: 'color', label: '设置颜色 (Color)' },
    { key: 'split', label: '拆分 / 分屏 (Split)' },
    { key: 'copyPath', label: '复制当前路径 (Copy Path)' },
    { key: 'saveLayout', label: '将布局保存为配置 (Save Layout)' },
    { key: 'newTerminal', label: '新建终端与配置 (New Terminal)' },
    { key: 'focusAllTabs', label: '聚焦所有标签页 (Focus Tabs)' },
    { key: 'focusAllPanes', label: '聚焦所有分块 (Focus Panes)' },
    { key: 'disconnect', label: '断开连接 (Disconnect)' },
    { key: 'closeLeft', label: '关闭左侧标签页 (Close Left)' },
    { key: 'closeRight', label: '关闭右侧标签页 (Close Right)' },
    { key: 'closeOthers', label: '关闭其他标签页 (Close Others)' },
    { key: 'close', label: '关闭当前标签页 (Close)' },
  ]

  get customThemes(): any[] {
    return this.ensureConfig().customThemes || []
  }

  importColorScheme(): void {
    const jsonStr = typeof window !== 'undefined'
      ? window.prompt(
          '请粘贴符合格式的配色方案 JSON:\n例如: {"name": "MyTheme", "surface": "#f1f5f9", "background": "#ffffff", "border": "#94a3b8", "text": "#0f172a", "primary": "#1e70bf"}'
        )
      : null
    if (!jsonStr) return
    try {
      const scheme = JSON.parse(jsonStr)
      if (!scheme.name || !scheme.surface || !scheme.text) {
        this.notifications?.error('无效的配色方案 JSON，至少需包含 name, surface, text 属性')
        return
      }
      const cfg = this.ensureConfig()
      if (!cfg.customThemes) cfg.customThemes = []
      cfg.customThemes.push(scheme)
      this.frameworkTheme = scheme.name
      this.saveConfig()
      this.notifications?.info(`已成功导入并应用配色方案: ${scheme.name}`)
    } catch (e: any) {
      this.notifications?.error(`解析配色方案失败: ${e.message || e}`)
    }
  }

  get uiLanguage(): string {
    return this.ensureConfig().uiLanguage || 'auto'
  }

  set uiLanguage(val: string) {
    this.ensureConfig().uiLanguage = val as any
  }

  get alwaysShowTabCloseButton(): boolean {
    return this.ensureConfig().alwaysShowTabCloseButton ?? false
  }

  set alwaysShowTabCloseButton(val: boolean) {
    this.ensureConfig().alwaysShowTabCloseButton = val
    this.ensureConfig().showTabCloseButton = val
    if (typeof document !== 'undefined') {
      document.body.setAttribute('data-tab-close-mode', val ? 'always' : 'hover')
      document.body.setAttribute('data-hide-tab-close', (!val).toString())
    }
  }

  get fileTransfer(): any {
    const cfg = this.ensureConfig()
    if (!cfg.fileTransfer) {
      cfg.fileTransfer = { ...DEFAULT_WORKBENCH_CONFIG.fileTransfer }
    }
    return cfg.fileTransfer
  }

  get sidebarVisibility(): any {
    const cfg = this.ensureConfig()
    if (!cfg.sidebarVisibility) {
      cfg.sidebarVisibility = { ...DEFAULT_WORKBENCH_CONFIG.sidebarVisibility }
    }
    return cfg.sidebarVisibility
  }

  get startupConfig(): any {
    const cfg = this.ensureConfig()
    if (!cfg.startup) {
      cfg.startup = { ...DEFAULT_WORKBENCH_CONFIG.startup }
    }
    return cfg.startup
  }

  set defaultSessionAppendMode(val: 'append' | 'overwrite') {
    this.sessionConfigService?.saveDefaultSessionConfig({
      logging: { ...this.defaultSession.logging, appendMode: val },
    })
  }

  set defaultSessionStartNewLogAtMidnight(val: boolean) {
    this.sessionConfigService?.saveDefaultSessionConfig({
      logging: { ...this.defaultSession.logging, startNewLogAtMidnight: val },
    })
  }

  set defaultSessionTimestampEachLine(val: boolean) {
    this.sessionConfigService?.saveDefaultSessionConfig({
      logging: { ...this.defaultSession.logging, timestampEachLine: val },
    })
  }

  set defaultSessionRawLog(val: boolean) {
    this.sessionConfigService?.saveDefaultSessionConfig({
      logging: { ...this.defaultSession.logging, mode: val ? 'raw' : 'transcript' },
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
    if (confirmed && this.sessionConfigService) {
      const count = this.sessionConfigService.applyDefaultSessionToAllProfiles(true)
      this.notifications?.info(`已成功将默认配置应用至 ${count} 个会话！`)
    }
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
