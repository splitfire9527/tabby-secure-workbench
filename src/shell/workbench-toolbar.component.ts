import { Component, Input, Output, EventEmitter, OnInit, HostListener, ElementRef, ChangeDetectorRef, Optional } from '@angular/core'
import { NotificationsService, ConfigService, AppService, ProfilesService } from 'tabby-core'
import { WorkbenchEncoding, DEFAULT_WORKBENCH_CONFIG } from '../config/config.model'
import { DirectoryPair } from '../sftp-plus/directory-pair.model'
import { validateDirectoryPair } from '../sftp-plus/navigation-policy'
import { StatefulCodec } from '../terminal-codec/stateful-codec'
import { describeEncodingSwitch, EncodingSwitchPrompt } from '../terminal-codec/encoding-switch'
import { SessionLoggerService } from '../session-logging/session-logger.service'
import { WorkbenchDialogService } from './workbench-dialog.service'
import { persistPortForward, PORT_FORWARD_SAVED_NOTICE } from './port-forward-persistence'
import { I18nService } from '../i18n/i18n.service'

@Component({
  selector: 'workbench-toolbar',
  template: `
    <div class="toolbar-actions">
      <!-- 1. Reconnect -->
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

      <!-- 2. Port Forwarding -->
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

      <!-- 3. Quick Connect -->
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

      <!-- 4. SFTP / PTY Toggle (Renamed to SFTP as requested) -->
      <button
        class="btn-toolbar-item"
        data-action="btn-toggle-sftp"
        [class.active]="viewMode === 'sftp'"
        (click)="toggleViewMode()"
        title="切换 SFTP / 终端 PTY 视图"
      >
        <svg *ngIf="viewMode !== 'sftp'" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
        <svg *ngIf="viewMode === 'sftp'" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="4 17 10 11 4 5"></polyline>
          <line x1="12" y1="19" x2="20" y2="19"></line>
        </svg>
        <span>{{ viewMode === 'sftp' ? '终端 PTY' : 'SFTP' }}</span>
      </button>

      <!-- 5. Directory Pairs (Located in Toolbar) -->
      <div class="toolbar-dropdown-container">
        <button
          class="btn-toolbar-item"
          data-action="btn-pairs-menu"
          [class.active]="showPairsMenu"
          (click)="showPairsMenu = !showPairsMenu; showEncodingPopup = false"
          title="成对目录快捷切换 (PTY 模式切换本地目录，SFTP 模式切换本地与远程)"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
          </svg>
          <span>成对目录</span>
          <span style="font-size: 9px; opacity: 0.7;">▾</span>
        </button>

        <!-- Directory Pairs Dropdown Popup -->
        <div *ngIf="showPairsMenu" class="toolbar-dropdown-menu pairs-dropdown shadow" (mousedown)="$event.stopPropagation()" (click)="$event.stopPropagation()">
          <div class="dropdown-header d-flex justify-content-between align-items-center px-2 py-1">
            <span class="small font-weight-bold text-light">成对目录</span>
            <button class="btn btn-xs btn-link text-muted p-0" (click)="showPairsMenu = false">&times;</button>
          </div>
          <div class="dropdown-hint px-2 py-1 text-muted">
            PTY 模式切换本地目录，SFTP 模式同时切换本地与远程
          </div>

          <div class="pairs-list">
            <div
              *ngFor="let p of directoryPairs"
              class="pair-menu-item px-2 py-1 d-flex justify-content-between align-items-center"
              (click)="onSelectPair(p)"
            >
              <div class="text-truncate mr-2" style="font-size: 11px;">
                <div class="text-light font-weight-bold text-truncate">{{ p.title }}</div>
                <div class="text-muted font-mono text-truncate" style="font-size: 10px;">
                  💻 {{ p.localPath || '(本地未设)' }} &harr; 📁 {{ p.remotePath || '(远程未设)' }}
                </div>
              </div>
              <button
                class="btn btn-xs btn-link text-danger p-0 ml-1"
                (click)="deletePair(p.id, $event)"
                title="删除成对目录"
              >
                &times;
              </button>
            </div>

            <div *ngIf="directoryPairs.length === 0" class="text-muted small text-center p-2">
              暂无保存的成对目录
            </div>
          </div>

          <!-- Add Pair Form -->
          <div class="p-2 border-top border-secondary">
            <div *ngIf="!showNewPairForm">
              <button class="btn btn-xs btn-block btn-outline-primary" (click)="showNewPairForm = true">
                + {{ t('sftp.newDirectoryPair', '新建成对目录') }}
              </button>
            </div>
            <div *ngIf="showNewPairForm" class="new-pair-form" (mousedown)="$event.stopPropagation()" (click)="$event.stopPropagation()">
              <input
                type="text"
                class="form-control form-control-sm mb-1 search-input"
                placeholder="名称 (例如: Web Project)"
                [(ngModel)]="newPairTitle"
                (mousedown)="$event.stopPropagation()"
                (mouseup)="$event.stopPropagation()"
                (click)="$event.stopPropagation()"
                (keydown)="$event.stopPropagation()"
                (keyup)="$event.stopPropagation()"
              />
              <input
                type="text"
                class="form-control form-control-sm mb-1 search-input"
                placeholder="本地路径 (例如: /home/user/project)"
                [(ngModel)]="newPairLocal"
                (mousedown)="$event.stopPropagation()"
                (mouseup)="$event.stopPropagation()"
                (click)="$event.stopPropagation()"
                (keydown)="$event.stopPropagation()"
                (keyup)="$event.stopPropagation()"
              />
              <input
                type="text"
                class="form-control form-control-sm mb-2 search-input"
                placeholder="远程路径 (例如: /var/www/project)"
                [(ngModel)]="newPairRemote"
                (mousedown)="$event.stopPropagation()"
                (mouseup)="$event.stopPropagation()"
                (click)="$event.stopPropagation()"
                (keydown)="$event.stopPropagation()"
                (keyup)="$event.stopPropagation()"
              />
              <div class="d-flex justify-content-end gap-1">
                <button class="btn btn-xs btn-secondary mr-1" (click)="showNewPairForm = false">取消</button>
                <button class="btn btn-xs btn-success" (click)="saveNewPair()">保存</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 6. Terminal Encoding (Anchored Dropdown Popup) -->
      <div class="toolbar-dropdown-container">
        <button
          class="btn-toolbar-item"
          data-action="btn-encoding"
          [class.active]="showEncodingPopup"
          (click)="showEncodingPopup = !showEncodingPopup; showPairsMenu = false"
          [title]="'当前编码: ' + currentEncoding + ' (点击切换)'"
        >
          <span style="color: #e5c07b; font-weight: bold; font-family: monospace;">T</span>
          <span>{{ currentEncoding }}</span>
          <span style="font-size: 9px; opacity: 0.7;">▾</span>
        </button>

        <!-- Encoding Dropdown Popup -->
        <div *ngIf="showEncodingPopup" class="toolbar-dropdown-menu encoding-dropdown shadow">
          <div class="dropdown-header px-2 py-1 d-flex justify-content-between align-items-center">
            <span class="small font-weight-bold text-light">{{ t('sftp.encoding', '终端编码') }}</span>
            <button class="btn btn-xs btn-link text-muted p-0" (click)="showEncodingPopup = false">&times;</button>
          </div>
          <div class="encoding-list py-1">
            <div
              *ngFor="let enc of availableEncodings"
              class="encoding-item px-3 py-1 d-flex align-items-center justify-content-between"
              [class.active]="enc === currentEncoding"
              (click)="requestEncodingSwitch(enc)"
            >
              <span class="font-mono" style="font-size: 12px;">{{ enc }}</span>
              <span *ngIf="enc === currentEncoding" style="color: #98c379; font-weight: bold;">✓</span>
            </div>
          </div>
          <div class="dropdown-footer px-2 py-1 text-warning">
            ⚠️ {{ t('sftp.encodingWarning', '未完成的多字节序列将以 U+FFFD 写入') }}
          </div>
        </div>
        <div *ngIf="encodingPrompt" class="toolbar-dropdown-menu encoding-dropdown shadow" data-role="encoding-switch">
          <div class="px-2 py-1 small">{{ t('sftp.encodingSwitch', '编码切换') }}</div>
          <div class="px-2 py-1 font-mono" data-role="encoding-switch-detail">{{ encodingPrompt.oldEncoding }} → {{ encodingPrompt.newEncoding }}</div>
          <div class="px-2 py-1 small">{{ encodingPrompt.at.toISOString() }}</div>
          <div class="px-2 py-1 text-warning">{{ encodingPrompt.warning }}</div>
          <div class="d-flex justify-content-end px-2 py-1">
            <button class="btn btn-xs btn-secondary mr-1" (click)="cancelEncodingSwitch()">{{ t('common.cancel', '取消') }}</button>
            <button class="btn btn-xs btn-success" (click)="confirmEncodingSwitch()">{{ t('common.confirm', '确定') }}</button>
          </div>
        </div>
      </div>

      <!-- 7. Session Logging -->
      <div class="toolbar-btn-group d-flex align-items-center">
        <button
          class="btn-toolbar-item"
          data-action="btn-logging"
          [class.active]="isLoggingActive"
          (click)="toggleLogging()"
          (contextmenu)="openLogDialog($event)"
          [title]="isLoggingActive ? '点击停止转录审计日志 (右键打开日志配置)' : '点击开始转录审计日志 (右键打开日志配置)'"
        >
          <span *ngIf="isLoggingActive" class="recording-dot mr-1"></span>
          <svg *ngIf="!isLoggingActive" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
          </svg>
          <span>{{ isLoggingActive ? '录制中' : '日志' }}</span>
        </button>
        <button
          class="btn-toolbar-item btn-toolbar-opt"
          data-action="btn-log-options"
          (click)="openLogDialog($event)"
          title="Session Options - Log File (会话日志配置)"
        >
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
      </div>

      <!-- 8. Session Options (Unified Session Configuration) -->
      <button
        class="btn-toolbar-item"
        data-action="btn-session-options"
        (click)="openSessionOptions()"
        title="会话属性 / 选项 (Session Options)"
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
        <span>属性</span>
      </button>

      <!-- 9. Close Split View (Only shown when multi-view / split pane exists) -->
      <button
        *ngIf="hasMultipleViews"
        class="btn-toolbar-item btn-close-split ml-auto"
        data-action="btn-close-split"
        (click)="closeCurrentSplitView()"
        title="关闭当前拆分视图 (Close Split View)"
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    <!-- Session Options - Log File Dialog (SecureCRT 1:1) -->
    <session-log-dialog
      *ngIf="showLogDialog"
      [activeTerminalTab]="activeTerminalTab"
      [profile]="activeTerminalTab?.profile"
      (close)="showLogDialog = false"
    ></session-log-dialog>

    <!-- Port Forwarding Dialog (Modal) -->
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

    <!-- Quick Connect Dialog (Modal) -->
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
        justify-content: flex-start;
        gap: 4px;
        flex-shrink: 0;
        width: 100%;
        box-sizing: border-box;
      }
      .toolbar-actions {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 4px;
        width: 100%;
      }
      .toolbar-dropdown-container {
        position: relative;
        display: inline-block;
      }
      .toolbar-dropdown-menu {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        z-index: 1050;
        background: #282c34;
        border: 1px solid #3e4451;
        border-radius: 4px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
        color: #abb2bf;
        box-sizing: border-box;
      }
      .encoding-dropdown {
        width: 220px;
      }
      .pairs-dropdown {
        width: 320px;
      }
      .dropdown-header {
        background: #21252b;
        border-bottom: 1px solid #3e4451;
      }
      .dropdown-hint {
        font-size: 10px;
        border-bottom: 1px solid #3e4451;
        background: rgba(0, 0, 0, 0.15);
      }
      .dropdown-footer {
        font-size: 10px;
        border-top: 1px solid #3e4451;
        background: rgba(0, 0, 0, 0.15);
      }
      .encoding-item,
      .pair-menu-item {
        cursor: pointer;
        user-select: none;
        transition: background 0.1s ease;
      }
      .encoding-item:hover,
      .pair-menu-item:hover {
        background: #3e4451;
        color: #ffffff;
      }
      .encoding-item.active {
        background: rgba(97, 175, 239, 0.2);
        color: #61afef;
        font-weight: bold;
      }
      .pairs-list {
        max-height: 200px;
        overflow-y: auto;
      }
      .search-input {
        background: #1e2227 !important;
        border-color: #3e4451 !important;
        color: #ffffff !important;
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
        padding: 3px 8px;
        font-size: 12px;
        border-radius: 4px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        white-space: nowrap;
        user-select: none;
        height: 26px;
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
      .btn-toolbar-opt {
        padding: 3px 4px;
        margin-left: -2px;
        opacity: 0.8;
      }
      .btn-toolbar-opt:hover {
        opacity: 1;
      }
      .btn-close-split {
        margin-left: auto;
        color: #e06c75;
        padding: 3px 6px;
      }
      .btn-close-split:hover {
        background: rgba(224, 108, 117, 0.2);
        color: #ff6b6b;
      }
    `,
  ],
})
export class WorkbenchToolbarComponent implements OnInit {
  @Input() activeTerminalTab: any
  @Input() viewMode: 'pty' | 'sftp' = 'pty'
  @Output() viewModeChange = new EventEmitter<'pty' | 'sftp'>()
  @Output() quickConnect = new EventEmitter<{ host: string; user: string; port: number }>()
  @Output() applyDirectoryPair = new EventEmitter<DirectoryPair>()

  showEncodingPopup = false
  showPairsMenu = false
  showPortForwardDialog = false
  showQuickConnectDialog = false
  showLogDialog = false

  showNewPairForm = false
  newPairTitle = ''
  newPairLocal = ''
  newPairRemote = ''

  availableEncodings: WorkbenchEncoding[] = ['UTF-8', 'GBK', 'GB2312', 'GB18030', 'BIG5']
  forwardType: 'local' | 'remote' | 'dynamic' = 'local'
  forwardHost = '127.0.0.1'
  forwardPort = 8080
  forwardTargetHost = 'localhost'
  forwardTargetPort = 80

  quickConnectString = ''
  encodingPrompt: EncodingSwitchPrompt | null = null

  constructor(
    private notifications: NotificationsService,
    private loggerService: SessionLoggerService,
    private config: ConfigService,
    private elementRef: ElementRef,
    public cdr: ChangeDetectorRef,
    @Optional() private dialogService?: WorkbenchDialogService,
    @Optional() private app?: AppService,
    @Optional() private profiles?: ProfilesService,
    @Optional() public i18n?: I18nService
  ) {}

  t(path: string, fallback?: string): string {
    return this.i18n?.t(path, fallback) || fallback || path
  }

  ngOnInit(): void {}

  get hasMultipleViews(): boolean {
    if (!this.activeTerminalTab) return false
    const parent = (this.activeTerminalTab as any).parent || (this.app ? this.app.getParentTab(this.activeTerminalTab) : null)
    if (parent && typeof parent.getAllTabs === 'function') {
      return parent.getAllTabs().length > 1
    }
    if (this.app?.activeTab && typeof (this.app.activeTab as any).getAllTabs === 'function') {
      return (this.app.activeTab as any).getAllTabs().length > 1
    }
    return false
  }

  closeCurrentSplitView(): void {
    if (!this.activeTerminalTab) return
    if (this.app) {
      this.app.closeTab(this.activeTerminalTab, true)
    } else {
      const parent = (this.activeTerminalTab as any).parent
      if (parent && typeof parent.removeTab === 'function') {
        parent.removeTab(this.activeTerminalTab)
      } else if (typeof (this.activeTerminalTab as any).destroy === 'function') {
        (this.activeTerminalTab as any).destroy()
      }
    }
  }

  openSessionOptions(): void {
    let profile = this.activeTerminalTab?.profile
    if (!profile && this.activeTerminalTab) {
      profile = {
        id: `temp-${Date.now()}`,
        name: this.activeTerminalTab.title || 'Current Session',
        options: {
          host: '127.0.0.1',
          port: 22,
          user: 'root',
        },
      }
    }
    if (this.dialogService) {
      this.dialogService.openSessionOptions(profile || null)
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: any): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.showEncodingPopup = false
      this.showPairsMenu = false
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

  get directoryPairs(): DirectoryPair[] {
    return this.config.store?.secureWorkbench?.directoryPairs || []
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

  requestEncodingSwitch(enc: WorkbenchEncoding): void {
    if (enc === this.currentEncoding) {
      this.showEncodingPopup = false
      return
    }
    this.encodingPrompt = describeEncodingSwitch(this.currentEncoding, enc)
    this.showEncodingPopup = false
  }

  confirmEncodingSwitch(): void {
    if (!this.encodingPrompt) return
    const enc = this.encodingPrompt.newEncoding
    const oldEncoding = this.encodingPrompt.oldEncoding
    if (this.codec) this.codec.switchEncoding(enc)
    this._manualEncoding = enc
    this.encodingPrompt = null
    this.notifications.info(this.t('sftp.encodingSwitched', `编码切换: ${oldEncoding} -> ${enc}`))
  }

  cancelEncodingSwitch(): void {
    this.encodingPrompt = null
  }

  onSelectPair(pair: DirectoryPair): void {
    this.applyDirectoryPair.emit(pair)
    this.showPairsMenu = false
  }

  saveNewPair(): void {
    if (!this.newPairTitle.trim()) {
      this.notifications.error(this.t('sftp.pairNameRequired', '请输入成对目录名称'))
      return
    }
    const pairError = validateDirectoryPair(this.newPairLocal, this.newPairRemote)
    if (pairError) {
      this.notifications.error(this.t('sftp.pairEmpty', pairError))
      return
    }
    if (!this.config.store.secureWorkbench) {
      this.config.store.secureWorkbench = { ...DEFAULT_WORKBENCH_CONFIG }
    }
    if (!Array.isArray(this.config.store.secureWorkbench.directoryPairs)) {
      this.config.store.secureWorkbench.directoryPairs = []
    }

    const newPair: DirectoryPair = {
      id: `pair-${Date.now()}`,
      title: this.newPairTitle.trim(),
      localPath: this.newPairLocal.trim(),
      remotePath: this.newPairRemote.trim(),
    }

    this.config.store.secureWorkbench.directoryPairs.push(newPair)
    this.config.save()
    this.notifications.info(`成对目录已保存: ${newPair.title}`)

    this.newPairTitle = ''
    this.newPairLocal = ''
    this.newPairRemote = ''
    this.showNewPairForm = false
  }

  deletePair(id: string, event: MouseEvent): void {
    event.stopPropagation()
    if (!this.config.store.secureWorkbench?.directoryPairs) return
    this.config.store.secureWorkbench.directoryPairs =
      this.config.store.secureWorkbench.directoryPairs.filter((p: DirectoryPair) => p.id !== id)
    this.config.save()
    this.notifications.info('成对目录已删除')
  }

  async savePortForward(): Promise<void> {
    const rule = {
      type: this.forwardType,
      sourceHost: this.forwardHost || '127.0.0.1',
      sourcePort: this.forwardPort || 8080,
      targetHost: this.forwardTargetHost || '127.0.0.1',
      targetPort: this.forwardTargetPort || 80,
    }
    const profile = this.activeTerminalTab?.profile
    if (profile && this.profiles && this.config?.save) {
      await persistPortForward(this.profiles, this.config, profile, rule)
    } else if (profile?.options) {
      if (!Array.isArray(profile.options.portForwards)) profile.options.portForwards = []
      profile.options.portForwards.push({ ...rule })
      await this.config?.save?.()
    }
    this.notifications.notice(this.t('sftp.portForwardSaved', PORT_FORWARD_SAVED_NOTICE))
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

  openLogDialog(event?: MouseEvent): void {
    if (event) {
      event.preventDefault()
      event.stopPropagation()
    }
    this.showLogDialog = true
    this.cdr.detectChanges()
  }
}

