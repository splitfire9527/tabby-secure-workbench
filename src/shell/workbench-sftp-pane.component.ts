import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, HostListener, Optional } from '@angular/core'
import { Subscription } from 'rxjs'
import { TransferStore } from '../transfer-store/transfer-store'
import { CrossTransferClipboard } from '../cross-transfer/cross-transfer-clipboard'
import { CrossTransferRelayService } from '../cross-transfer/cross-transfer-relay.service'
import { ConfigService, NotificationsService } from 'tabby-core'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import { TarChannel } from '../sftp-plus/tar-channel'
import { OverwriteUploader } from '../sftp-plus/overwrite-uploader'
import { adaptSftpSession } from '../sftp-plus/sftp-client-adapter'
import { decideConflict, isMissingRemoteFile, ConflictDecision } from '../sftp-plus/upload-policy'
import { TransferAuditLog, auditFilePath } from '../sftp-plus/transfer-audit-log'
import {
  SFTP_CONTEXT_ACTIONS,
  SftpBookmark,
  applyBookmark,
  applyPartialPair,
  looksLikeText,
  previewOutcome,
  resolveStartPaths,
  PREVIEW_MAX_BYTES,
} from '../sftp-plus/navigation-policy'
import { I18nService } from '../i18n/i18n.service'
import { DEFAULT_WORKBENCH_CONFIG } from '../config/config.model'

let originalFs: any = null
try {
  if (typeof window !== 'undefined' && (window as any).require) {
    originalFs = (window as any).require('original-fs')
  } else if (typeof (global as any).__non_webpack_require__ !== 'undefined') {
    originalFs = (global as any).__non_webpack_require__('original-fs')
  }
} catch {}

export interface SftpFileItem {
  name: string
  isDirectory: boolean
  size: number
  mode?: string
  modified?: string
  modifiedMs?: number
}

export interface SftpSessionView {
  id: string
  title: string
  localPath: string
  localPathInput: string
  remotePath: string
  remotePathInput: string
  showHiddenLocal: boolean
  showHiddenRemote: boolean
  filterLocal: string
  filterRemote: string
  sortKeyLocal: 'name' | 'size' | 'modified'
  sortAscLocal: boolean
  sortKeyRemote: 'name' | 'size' | 'modified'
  sortAscRemote: boolean
  localFiles: SftpFileItem[]
  remoteFiles: SftpFileItem[]
  filteredLocalFiles: SftpFileItem[]
  filteredRemoteFiles: SftpFileItem[]
  selectedLocalFile: SftpFileItem | null
  selectedRemoteFile: SftpFileItem | null
}

@Component({
  selector: 'workbench-sftp-pane',
  template: `
    <div class="workbench-sftp-container" [class.is-undock]="dockMode === 'undock'" (click)="closeContextMenu()">
      <!-- 1. Top SFTP Action Bar (DevTools style docking, no 'SFTP' text, no PTY button) -->
      <div class="sftp-sub-toolbar d-flex justify-content-between align-items-center px-2">
        <div class="d-flex align-items-center gap-2 text-truncate mr-2">
          <span *ngIf="dockMode === 'undock'" class="badge badge-secondary py-0 px-1 font-mono" style="cursor: move; font-size: 10px;" title="按住标题栏可自由拖拽悬浮窗">
            ⋮⋮ 拖动移动
          </span>
          <span class="text-muted font-mono text-truncate" style="font-size: 11px;">
            <span class="font-weight-bold text-dark">{{ activeView?.localPath }}</span> &harr;
            <span class="font-weight-bold text-dark">{{ activeView?.remotePath }}</span>
          </span>
        </div>

        <div class="d-flex align-items-center gap-1 flex-shrink-0">
          <button
            *ngIf="clipboard.hasItem()"
            class="btn btn-xs btn-outline-success py-0 px-2 mr-1"
            style="font-size: 11px; height: 22px;"
            (click)="pasteFromOtherConnection(activeView)"
            title="粘贴来自其他连接的复制文件"
          >
            {{ t('sftp.crossPaste') }}
          </button>
          <button class="btn btn-xs btn-outline-secondary py-0 px-2 mr-1" style="font-size: 11px; height: 22px;" (click)="saveBookmark('remote')">
            {{ t('sftp.bookmarkRemote') }}
          </button>

          <!-- Chrome DevTools Docking Options -->
          <div class="devtools-dock-group d-flex align-items-center">
            <button
              class="dock-btn"
              [class.active]="dockMode === 'undock'"
              (click)="setDockMode('undock')"
              title="弹出窗口 / 悬浮模式 (Undock into separate pane)"
            >
              <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
                <path d="M2 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3zm8 3h3a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-3h1v3h6V7h-3V6z"/>
              </svg>
            </button>
            <button
              class="dock-btn"
              [class.active]="dockMode === 'bottom'"
              (click)="setDockMode('bottom')"
              title="停靠在终端下方 (Dock to bottom)"
            >
              <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
                <rect x="2" y="2" width="12" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/>
                <rect x="2" y="9" width="12" height="5" rx="0.5" fill="currentColor"/>
              </svg>
            </button>
            <button
              class="dock-btn"
              [class.active]="dockMode === 'right'"
              (click)="setDockMode('right')"
              title="停靠在终端右侧 (Dock to right)"
            >
              <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
                <rect x="2" y="2" width="12" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/>
                <rect x="9" y="2" width="5" height="12" rx="0.5" fill="currentColor"/>
              </svg>
            </button>
            <button
              class="dock-btn"
              [class.active]="dockMode === 'full'"
              (click)="setDockMode('full')"
              title="铺满全屏 (Full tab)"
            >
              <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
                <rect x="2" y="2" width="12" height="12" rx="1" fill="currentColor"/>
              </svg>
            </button>
            <button
              class="dock-btn dock-btn-close"
              (click)="setDockMode('close')"
              title="关闭 SFTP 并切回终端"
            >
              <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8">
                <line x1="4" y1="4" x2="12" y2="12"/>
                <line x1="12" y1="4" x2="4" y2="12"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- 2. SFTP Views Tab Bar (Multi-View Window Management) -->
      <div class="sftp-views-tab-bar d-flex align-items-center justify-content-between px-2">
        <!-- View Pills -->
        <div class="d-flex align-items-center gap-1 overflow-auto flex-1 mr-2" style="scrollbar-width: none;">
          <div
            *ngFor="let v of views; let i = index"
            class="view-tab-pill d-flex align-items-center gap-1"
            [class.active]="v.id === activeViewId"
            (click)="setActiveView(v.id)"
            [title]="v.localPath + ' ⇄ ' + v.remotePath"
          >
            <span class="view-tab-title font-mono font-weight-bold">
              视图 {{ i + 1 }}: {{ getPathBasename(v.localPath) }} ⇄ {{ getPathBasename(v.remotePath) }}
            </span>
            <button
              *ngIf="views.length > 1"
              class="btn-close-view-tab"
              (click)="closeView(v.id, $event)"
              title="关闭此视图窗口"
            >
              &times;
            </button>
          </div>
          <button
            class="btn btn-xs btn-add-view d-flex align-items-center gap-1"
            (click)="addNewView()"
            title="新建本地-远程视图窗口 (共享当前连接与传输队列)"
          >
            <span>+ 新建视图</span>
          </button>
        </div>

        <!-- Split View Mode Toggles -->
        <div class="d-flex align-items-center gap-1 flex-shrink-0">
          <span class="text-muted small" style="font-size: 10px;">分屏:</span>
          <button
            class="btn btn-xs view-mode-btn"
            [class.active]="viewDisplayMode === 'single-tab'"
            (click)="viewDisplayMode = 'single-tab'"
            title="单标签视窗切换"
          >
            单视窗
          </button>
          <button
            *ngIf="views.length > 1"
            class="btn btn-xs view-mode-btn"
            [class.active]="viewDisplayMode === 'split-horizontal'"
            (click)="viewDisplayMode = 'split-horizontal'"
            title="左右并排分屏"
          >
            左右并排
          </button>
          <button
            *ngIf="views.length > 1"
            class="btn btn-xs view-mode-btn"
            [class.active]="viewDisplayMode === 'split-vertical'"
            (click)="viewDisplayMode = 'split-vertical'"
            title="上下并排分屏"
          >
            上下并排
          </button>
        </div>
      </div>

      <!-- 3. Multi-View Dual-Pane Area -->
      <div
        class="sftp-views-container"
        [class.split-horizontal]="viewDisplayMode === 'split-horizontal'"
        [class.split-vertical]="viewDisplayMode === 'split-vertical'"
      >
        <div
          *ngFor="let view of displayedViews"
          class="sftp-single-view-wrapper"
          [class.focused-view]="view.id === activeViewId"
          (click)="setActiveView(view.id)"
        >
          <!-- Dual-Pane Row for This View -->
          <div class="sftp-panes-row">
            <!-- Left Pane: Local Files -->
            <div class="sftp-pane-card" (contextmenu)="onPaneContextMenu($event, view, 'local')">
              <!-- Local Address Bar -->
              <div class="pane-address-bar d-flex align-items-center gap-1 px-2 py-1" (mousedown)="$event.stopPropagation()" (click)="$event.stopPropagation()">
                <button class="btn btn-xs btn-toolbar-icon" (click)="goUpLocal(view)" title="返回上一级">
                  ⬆
                </button>
                <button class="btn btn-xs btn-toolbar-icon" (click)="goHomeLocal(view)" title="用户主目录">
                  🏠
                </button>
                <button class="btn btn-xs btn-toolbar-icon" (click)="loadLocalFiles(view)" title="刷新">
                  🔄
                </button>
                <button
                  class="btn btn-xs btn-toolbar-icon"
                  [class.active]="view.showHiddenLocal"
                  (click)="view.showHiddenLocal = !view.showHiddenLocal; loadLocalFiles(view)"
                  title="切换显示隐藏文件"
                >
                  👁
                </button>
                <input
                  type="text"
                  class="form-control form-control-xs path-input font-mono flex-1"
                  [(ngModel)]="view.localPathInput"
                  (mousedown)="$event.stopPropagation()"
                  (mouseup)="$event.stopPropagation()"
                  (click)="$event.stopPropagation()"
                  (keydown)="$event.stopPropagation()"
                  (keyup)="$event.stopPropagation()"
                  (keyup.enter)="applyLocalPathInput(view)"
                  title="按回车前往路径"
                />
                <input
                  type="text"
                  class="form-control form-control-xs filter-input"
                  style="width: 75px;"
                  placeholder="过滤..."
                  [(ngModel)]="view.filterLocal"
                  (mousedown)="$event.stopPropagation()"
                  (mouseup)="$event.stopPropagation()"
                  (click)="$event.stopPropagation()"
                  (keydown)="$event.stopPropagation()"
                  (keyup)="$event.stopPropagation()"
                  (ngModelChange)="applyLocalFilter(view)"
                />
              </div>

              <!-- Local Action Buttons -->
              <div class="pane-actions-bar d-flex align-items-center gap-1 px-2 py-1">
                <button class="btn btn-xs btn-outline-secondary py-0 px-1" (click)="openNewFolderDialog(view, 'local')" title="新建文件夹">
                  + 文件夹
                </button>
                <button class="btn btn-xs btn-outline-secondary py-0 px-1" (click)="openNewFileDialog(view, 'local')" title="新建文件">
                  + 文件
                </button>
                <button class="btn btn-xs btn-outline-primary py-0 px-1" (click)="triggerDirectoryPicker(view)" title="选择本地目录上传到当前远程路径">
                  📁 上传目录...
                </button>
                <input
                  #dirPickerInput
                  type="file"
                  webkitdirectory
                  directory
                  style="display: none;"
                  (change)="onDirectoryPicked(view, $event)"
                />
                <button
                  class="btn btn-xs btn-outline-secondary py-0 px-1"
                  [disabled]="!view.selectedLocalFile || view.selectedLocalFile.name === '..'"
                  (click)="openRenameDialog(view, 'local')"
                  title="重命名"
                >
                  重命名
                </button>
                <button
                  class="btn btn-xs btn-outline-danger py-0 px-1"
                  [disabled]="!view.selectedLocalFile || view.selectedLocalFile.name === '..'"
                  (click)="deleteSelectedLocal(view)"
                  title="删除"
                >
                  删除
                </button>
                <span class="ml-auto text-muted font-mono" style="font-size: 10px;">
                  {{ view.filteredLocalFiles.length }} 项
                </span>
              </div>

              <!-- Local Table Header -->
              <div class="pane-table-header d-flex align-items-center px-2 py-1">
                <div class="col-name flex-1 text-truncate" (click)="sortFiles(view, 'local', 'name')">
                  名称 {{ getSortIcon(view, 'local', 'name') }}
                </div>
                <div class="col-size text-right" style="width: 70px;" (click)="sortFiles(view, 'local', 'size')">
                  大小 {{ getSortIcon(view, 'local', 'size') }}
                </div>
                <div class="col-mode text-center" style="width: 85px;">
                  权限
                </div>
                <div class="col-modified text-right" style="width: 120px;" (click)="sortFiles(view, 'local', 'modified')">
                  修改时间 {{ getSortIcon(view, 'local', 'modified') }}
                </div>
              </div>

              <!-- Local Table Body -->
              <div class="pane-card-body scrollable p-1">
                <div
                  *ngFor="let file of view.filteredLocalFiles"
                  class="file-row d-flex align-items-center px-2 py-1 rounded"
                  tabindex="0"
                  [class.selected]="view.selectedLocalFile?.name === file.name"
                  (click)="view.selectedLocalFile = file"
                  (dblclick)="onDblClickLocal(view, file)"
                  (keydown.enter)="onEnterFile(view, file, 'local')"
                  (contextmenu)="onFileContextMenu($event, view, file, 'local')"
                >
                  <div class="col-name">
                    <span class="file-icon">{{ file.isDirectory ? '📁' : '📄' }}</span>
                    <span class="file-name" [title]="file.name">{{ file.name }}</span>
                  </div>
                  <div class="col-size text-right font-mono" style="width: 70px;">
                    {{ file.isDirectory ? '--' : formatBytes(file.size) }}
                  </div>
                  <div class="col-mode text-center font-mono" style="width: 85px;">
                    {{ file.mode || '--' }}
                  </div>
                  <div class="col-modified text-right font-mono" style="width: 120px;">
                    {{ file.modified || '--' }}
                  </div>
                </div>
                <div *ngIf="view.filteredLocalFiles.length === 0" class="text-muted small text-center p-3">
                  目录为空或无匹配项
                </div>
              </div>
            </div>

            <!-- Right Pane: Remote Files -->
            <div
              class="sftp-pane-card"
              [class.drag-hover]="isRemoteDragOver"
              (dragover)="onDragOverRemote($event)"
              (dragleave)="onDragLeaveRemote($event)"
              (drop)="onDropRemote($event, view)"
              (contextmenu)="onPaneContextMenu($event, view, 'remote')"
            >
              <!-- Remote Address Bar -->
              <div class="pane-address-bar d-flex align-items-center gap-1 px-2 py-1" (mousedown)="$event.stopPropagation()" (click)="$event.stopPropagation()">
                <button class="btn btn-xs btn-toolbar-icon" (click)="goUpRemote(view)" title="返回上一级">
                  ⬆
                </button>
                <button class="btn btn-xs btn-toolbar-icon" (click)="goHomeRemote(view)" title="远程主目录">
                  🏠
                </button>
                <button class="btn btn-xs btn-toolbar-icon" (click)="loadRemoteFiles(view)" title="刷新">
                  🔄
                </button>
                <button
                  class="btn btn-xs btn-toolbar-icon"
                  [class.active]="view.showHiddenRemote"
                  (click)="view.showHiddenRemote = !view.showHiddenRemote; loadRemoteFiles(view)"
                  title="切换显示隐藏文件"
                >
                  👁
                </button>
                <input
                  type="text"
                  class="form-control form-control-xs path-input font-mono flex-1"
                  [(ngModel)]="view.remotePathInput"
                  (mousedown)="$event.stopPropagation()"
                  (mouseup)="$event.stopPropagation()"
                  (click)="$event.stopPropagation()"
                  (keydown)="$event.stopPropagation()"
                  (keyup)="$event.stopPropagation()"
                  (keyup.enter)="applyRemotePathInput(view)"
                  title="按回车前往远程路径"
                />
                <input
                  type="text"
                  class="form-control form-control-xs filter-input"
                  style="width: 75px;"
                  placeholder="过滤..."
                  [(ngModel)]="view.filterRemote"
                  (mousedown)="$event.stopPropagation()"
                  (mouseup)="$event.stopPropagation()"
                  (click)="$event.stopPropagation()"
                  (keydown)="$event.stopPropagation()"
                  (keyup)="$event.stopPropagation()"
                  (ngModelChange)="applyRemoteFilter(view)"
                />
              </div>

              <!-- Remote Action Buttons -->
              <div class="pane-actions-bar d-flex align-items-center gap-1 px-2 py-1">
                <button class="btn btn-xs btn-outline-secondary py-0 px-1" (click)="openNewFolderDialog(view, 'remote')" title="新建文件夹">
                  + 文件夹
                </button>
                <button class="btn btn-xs btn-outline-secondary py-0 px-1" (click)="openNewFileDialog(view, 'remote')" title="新建文件">
                  + 文件
                </button>
                <button
                  class="btn btn-xs btn-outline-secondary py-0 px-1"
                  [disabled]="!view.selectedRemoteFile || view.selectedRemoteFile.name === '..'"
                  (click)="openRenameDialog(view, 'remote')"
                  title="重命名"
                >
                  重命名
                </button>
                <button
                  class="btn btn-xs btn-outline-secondary py-0 px-1"
                  [disabled]="!view.selectedRemoteFile || view.selectedRemoteFile.name === '..'"
                  (click)="openChmodDialog(view)"
                  title="修改权限 (chmod)"
                >
                  chmod
                </button>
                <button
                  class="btn btn-xs btn-outline-info py-0 px-1"
                  [disabled]="!view.selectedRemoteFile || view.selectedRemoteFile.name === '..'"
                  (click)="copyRemoteFile(view)"
                  title="远程复制（用于跨连接粘贴）"
                >
                  复制
                </button>
                <button
                  class="btn btn-xs btn-outline-danger py-0 px-1"
                  [disabled]="!view.selectedRemoteFile || view.selectedRemoteFile.name === '..'"
                  (click)="deleteSelectedRemote(view)"
                  title="删除"
                >
                  删除
                </button>
                <span class="ml-auto text-muted font-mono" style="font-size: 10px;">
                  {{ view.filteredRemoteFiles.length }} 项
                </span>
              </div>

              <!-- Remote Table Header -->
              <div class="pane-table-header d-flex align-items-center px-2 py-1">
                <div class="col-name flex-1 text-truncate" (click)="sortFiles(view, 'remote', 'name')">
                  名称 {{ getSortIcon(view, 'remote', 'name') }}
                </div>
                <div class="col-size text-right" style="width: 70px;" (click)="sortFiles(view, 'remote', 'size')">
                  大小 {{ getSortIcon(view, 'remote', 'size') }}
                </div>
                <div class="col-mode text-center" style="width: 85px;">
                  权限
                </div>
                <div class="col-modified text-right" style="width: 120px;" (click)="sortFiles(view, 'remote', 'modified')">
                  修改时间 {{ getSortIcon(view, 'remote', 'modified') }}
                </div>
              </div>

              <!-- Remote Table Body -->
              <div class="pane-card-body scrollable p-1">
                <div
                  *ngFor="let file of view.filteredRemoteFiles"
                  class="file-row d-flex align-items-center px-2 py-1 rounded"
                  tabindex="0"
                  [class.selected]="view.selectedRemoteFile?.name === file.name"
                  (click)="view.selectedRemoteFile = file"
                  (dblclick)="onDblClickRemote(view, file)"
                  (keydown.enter)="onEnterFile(view, file, 'remote')"
                  (contextmenu)="onFileContextMenu($event, view, file, 'remote')"
                >
                  <div class="col-name">
                    <span class="file-icon">{{ file.isDirectory ? '📁' : '📄' }}</span>
                    <span class="file-name" [title]="file.name">{{ file.name }}</span>
                  </div>
                  <div class="col-size text-right font-mono" style="width: 70px;">
                    {{ file.isDirectory ? '--' : formatBytes(file.size) }}
                  </div>
                  <div class="col-mode text-center font-mono" style="width: 85px;">
                    {{ file.mode || '--' }}
                  </div>
                  <div class="col-modified text-right font-mono" style="width: 120px;">
                    {{ file.modified || '--' }}
                  </div>
                </div>
                <div *ngIf="view.filteredRemoteFiles.length === 0" class="text-muted small text-center p-3">
                  目录为空或无匹配项
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 4. Context Menu (Right Click) -->
      <div
        *ngIf="showContextMenu"
        class="sftp-context-menu shadow"
        [style.left.px]="contextMenuX"
        [style.top.px]="contextMenuY"
        (click)="$event.stopPropagation()"
      >
        <ng-container *ngIf="contextMenuTarget === 'local'">
          <div *ngIf="contextMenuFile && !contextMenuFile.isDirectory" class="ctx-item" (click)="contextUpload()">
            <span>上传到远程</span>
            <span class="ctx-shortcut">Enter</span>
          </div>
          <div *ngIf="contextMenuFile && contextMenuFile.isDirectory && contextMenuFile.name !== '..'" class="ctx-item" (click)="contextUploadDirectory(true)">
            <span>🚀 压缩打包上传 (tar加速)</span>
          </div>
          <div *ngIf="contextMenuFile && contextMenuFile.isDirectory && contextMenuFile.name !== '..'" class="ctx-item" (click)="contextUploadDirectory(false)">
            <span>📁 常规递归上传</span>
          </div>
          <div *ngIf="contextMenuFile && contextMenuFile.name !== '..'" class="ctx-item" (click)="openRenameDialog(contextMenuView!, 'local'); closeContextMenu()">
            <span>重命名</span>
          </div>
          <div *ngIf="contextMenuFile && contextMenuFile.name !== '..'" class="ctx-item text-danger" (click)="deleteSelectedLocal(contextMenuView!); closeContextMenu()">
            <span>删除</span>
          </div>
          <div *ngIf="contextMenuFile" class="ctx-divider"></div>
          <div class="ctx-item" (click)="openNewFolderDialog(contextMenuView!, 'local'); closeContextMenu()">
            <span>新建文件夹</span>
          </div>
          <div class="ctx-item" (click)="openNewFileDialog(contextMenuView!, 'local'); closeContextMenu()">
            <span>新建文件</span>
          </div>
          <div class="ctx-item" (click)="triggerDirectoryPicker(contextMenuView!); closeContextMenu()">
            <span>📁 上传本地目录...</span>
          </div>
          <div class="ctx-item" (click)="loadLocalFiles(contextMenuView!); closeContextMenu()">
            <span>刷新本地</span>
          </div>
        </ng-container>

        <ng-container *ngIf="contextMenuTarget === 'remote'">
          <div *ngIf="contextMenuFile && !contextMenuFile.isDirectory" class="ctx-item" (click)="contextDownload()">
            <span>下载到本地</span>
            <span class="ctx-shortcut">Enter</span>
          </div>
          <div *ngIf="contextMenuFile && contextMenuFile.isDirectory && contextMenuFile.name !== '..'" class="ctx-item" (click)="contextDownloadDirectory(true)">
            <span>🚀 压缩打包下载 (tar加速)</span>
          </div>
          <div *ngIf="contextMenuFile && contextMenuFile.isDirectory && contextMenuFile.name !== '..'" class="ctx-item" (click)="contextDownloadDirectory(false)">
            <span>📁 常规递归下载</span>
          </div>
          <div *ngIf="contextMenuFile && contextMenuFile.name !== '..'" class="ctx-item" (click)="copyRemoteFile(contextMenuView!); closeContextMenu()">
            <span>复制 (跨连接)</span>
          </div>
          <div *ngIf="contextMenuFile && contextMenuFile.name !== '..'" class="ctx-item" (click)="openChmodDialog(contextMenuView!); closeContextMenu()">
            <span>修改权限 (chmod)</span>
          </div>
          <div *ngIf="contextMenuFile && contextMenuFile.name !== '..'" class="ctx-item" (click)="openRenameDialog(contextMenuView!, 'remote'); closeContextMenu()">
            <span>重命名</span>
          </div>
          <div *ngIf="contextMenuFile && contextMenuFile.name !== '..'" class="ctx-item text-danger" (click)="deleteSelectedRemote(contextMenuView!); closeContextMenu()">
            <span>删除</span>
          </div>
          <div *ngIf="contextMenuFile" class="ctx-divider"></div>
          <div class="ctx-item" (click)="openNewFolderDialog(contextMenuView!, 'remote'); closeContextMenu()">
            <span>新建文件夹</span>
          </div>
          <div class="ctx-item" (click)="openNewFileDialog(contextMenuView!, 'remote'); closeContextMenu()">
            <span>新建文件</span>
          </div>
          <div class="ctx-item" (click)="loadRemoteFiles(contextMenuView!); closeContextMenu()">
            <span>刷新远程</span>
          </div>
        </ng-container>

        <div class="ctx-divider"></div>
        <div class="ctx-item" (click)="setDockMode('close'); closeContextMenu()">
          <span>切回终端 PTY</span>
        </div>
      </div>

      <!-- 5. Action Dialogs Modal -->
      <div *ngIf="showActionModal" class="modal-dialog-backdrop" (click)="showActionModal = false">
        <div class="card p-3 shadow" style="width: 360px;" (click)="$event.stopPropagation()">
          <h6 class="font-weight-bold mb-2 text-dark">{{ actionModalTitle }}</h6>
          <div class="form-group mb-3">
            <label class="small text-muted">{{ actionModalPrompt }}</label>
            <input
              type="text"
              class="form-control form-control-sm font-mono"
              [(ngModel)]="actionModalValue"
              (mousedown)="$event.stopPropagation()"
              (mouseup)="$event.stopPropagation()"
              (click)="$event.stopPropagation()"
              (keydown)="$event.stopPropagation()"
              (keyup)="$event.stopPropagation()"
              (keyup.enter)="confirmActionModal()"
            />
          </div>
          <div class="d-flex justify-content-end gap-2">
            <button class="btn btn-sm btn-secondary mr-2" (click)="showActionModal = false">取消</button>
            <button class="btn btn-sm btn-primary" (click)="confirmActionModal()">确认</button>
          </div>
        </div>
      </div>

      <div *ngIf="previewText !== null" class="modal-dialog-backdrop" (click)="previewText = null">
        <div class="card p-3 shadow" style="width: 520px; max-height: 70%;" (click)="$event.stopPropagation()">
          <h6 class="font-weight-bold mb-2 text-dark">{{ t('sftp.previewTitle', '只读预览') }}</h6>
          <pre class="mb-2" style="max-height: 320px; overflow: auto; white-space: pre-wrap;">{{ previewText }}</pre>
          <div class="d-flex justify-content-end">
            <button class="btn btn-sm btn-secondary" (click)="previewText = null">{{ t('common.close', '关闭') }}</button>
          </div>
        </div>
      </div>

      <div *ngIf="showConflictModal" class="modal-dialog-backdrop">
        <div class="card p-3 shadow" style="width: 360px;" (click)="$event.stopPropagation()">
          <h6 class="font-weight-bold mb-2 text-dark">{{ t('sftp.conflictTitle', '文件已存在') }}</h6>
          <div class="small mb-3">{{ conflictFileName }}</div>
          <div class="d-flex justify-content-end gap-2">
            <button class="btn btn-sm btn-secondary mr-2" (click)="chooseConflict('cancel')">{{ t('common.cancel', '取消') }}</button>
            <button class="btn btn-sm btn-outline-secondary mr-2" (click)="chooseConflict('skip')">{{ t('sftp.conflictSkip', '跳过') }}</button>
            <button class="btn btn-sm btn-primary" (click)="chooseConflict('overwrite')">{{ t('sftp.conflictOverwrite', '覆盖') }}</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        flex: 1;
        min-height: 0;
        background: #dfdfdf;
        color: #222222;
        overflow: hidden;
        position: relative;
      }
      .workbench-sftp-container {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        overflow: hidden;
        position: relative;
        background: #dfdfdf;
      }
      .sftp-sub-toolbar {
        height: 30px;
        min-height: 30px;
        background: #f0f2f5;
        border-bottom: 1px solid #d0d4dc;
        flex-shrink: 0;
      }
      .workbench-sftp-container.is-undock .sftp-sub-toolbar {
        cursor: move;
        user-select: none;
      }
      .devtools-dock-group {
        gap: 2px;
        background: #e4e7eb;
        border: 1px solid #d0d4dc;
        border-radius: 3px;
        padding: 1px 2px;
      }
      .dock-btn {
        background: transparent;
        border: 1px solid transparent;
        border-radius: 2px;
        width: 22px;
        height: 20px;
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: #555555;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .dock-btn svg {
        width: 13px !important;
        height: 13px !important;
        max-width: 13px !important;
        max-height: 13px !important;
        flex-shrink: 0 !important;
        display: inline-block !important;
      }
      .dock-btn:hover {
        background: #ffffff;
        color: #111111;
        border-color: #b0b4bc;
      }
      .dock-btn.active {
        background: #1e70bf;
        color: #ffffff;
        border-color: #1e70bf;
      }
      .dock-btn-close:hover {
        background: #d6334a;
        color: #ffffff;
        border-color: #d6334a;
      }

      /* Views Tab Bar */
      .sftp-views-tab-bar {
        height: 28px;
        min-height: 28px;
        background: #e8eaed;
        border-bottom: 1px solid #d0d4dc;
        flex-shrink: 0;
      }
      .view-tab-pill {
        background: #d8dce2;
        border: 1px solid #c0c4cc;
        border-radius: 3px;
        padding: 2px 7px;
        font-size: 11px;
        color: #333333;
        cursor: pointer;
        user-select: none;
        white-space: nowrap;
        transition: all 0.15s ease;
        height: 20px;
      }
      .view-tab-pill:hover {
        background: #ffffff;
        color: #000000;
      }
      .view-tab-pill.active {
        background: #ffffff;
        border-color: #1e70bf;
        color: #1e70bf;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      }
      .btn-close-view-tab {
        background: transparent;
        border: none;
        color: #888888;
        font-size: 13px;
        line-height: 1;
        cursor: pointer;
        padding: 0 2px;
        margin-left: 3px;
      }
      .btn-close-view-tab:hover {
        color: #d6334a;
      }
      .btn-add-view {
        background: #ffffff;
        border: 1px dashed #a0a6b2;
        color: #1e70bf;
        padding: 1px 6px;
        height: 20px;
        font-size: 11px;
        border-radius: 3px;
        cursor: pointer;
        white-space: nowrap;
      }
      .btn-add-view:hover {
        background: #e6f7ff;
        border-color: #1e70bf;
      }
      .view-mode-btn {
        background: #ffffff;
        border: 1px solid #d0d4dc;
        color: #444444;
        padding: 1px 6px;
        height: 20px;
        font-size: 11px;
        border-radius: 2px;
        cursor: pointer;
      }
      .view-mode-btn:hover {
        background: #e4e7eb;
        color: #000000;
      }
      .view-mode-btn.active {
        background: #1e70bf;
        border-color: #1e70bf;
        color: #ffffff;
      }

      /* Multi-View Container */
      .sftp-views-container {
        flex: 1;
        display: flex;
        flex-direction: row;
        width: 100%;
        min-height: 0;
        overflow: hidden;
      }
      .sftp-views-container.split-horizontal {
        flex-direction: row;
      }
      .sftp-views-container.split-vertical {
        flex-direction: column;
      }

      .sftp-single-view-wrapper {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
        height: 100%;
        position: relative;
        border-right: 1px solid #c0c4cc;
      }
      .sftp-single-view-wrapper:last-child {
        border-right: none;
      }
      .sftp-views-container.split-vertical .sftp-single-view-wrapper {
        border-right: none;
        border-bottom: 1px solid #c0c4cc;
      }
      .sftp-views-container.split-vertical .sftp-single-view-wrapper:last-child {
        border-bottom: none;
      }
      .sftp-single-view-wrapper.focused-view {
        outline: 1px solid #1e70bf;
        outline-offset: -1px;
      }

      .sftp-panes-row {
        flex: 1;
        display: flex;
        flex-direction: row;
        width: 100%;
        min-height: 0;
        overflow: hidden;
      }
      .sftp-pane-card {
        flex: 1;
        display: flex;
        flex-direction: column;
        border-right: 1px solid #d0d4dc;
        min-width: 0;
        height: 100%;
        background: #ffffff;
      }
      .sftp-pane-card:last-child {
        border-right: none;
      }
      .sftp-pane-card.drag-hover {
        outline: 2px dashed #1e70bf;
        outline-offset: -2px;
        background-color: rgba(30, 112, 191, 0.04);
      }
      .pane-address-bar {
        height: 28px;
        min-height: 28px;
        background: #f0f2f5;
        border-bottom: 1px solid #d0d4dc;
        flex-shrink: 0;
        overflow-x: auto;
        white-space: nowrap;
        scrollbar-width: none;
      }
      .pane-address-bar button {
        flex-shrink: 0;
      }
      .pane-actions-bar {
        height: 26px;
        min-height: 26px;
        background: #f8f9fa;
        border-bottom: 1px solid #d0d4dc;
        flex-shrink: 0;
        overflow-x: auto;
        white-space: nowrap;
        scrollbar-width: none;
      }
      .pane-actions-bar button {
        flex-shrink: 0;
        white-space: nowrap;
      }
      .pane-table-header {
        height: 24px;
        min-height: 24px;
        background: #f0f2f5;
        border-bottom: 1px solid #d0d4dc;
        font-size: 11px;
        color: #555555;
        font-weight: 600;
        user-select: none;
        flex-shrink: 0;
      }
      .pane-table-header > div {
        cursor: pointer;
      }
      .pane-table-header > div:hover {
        color: #111111;
      }
      .pane-card-body {
        flex: 1;
        overflow-y: auto;
        min-height: 0;
        background: #ffffff;
      }
      .btn-toolbar-icon {
        background: transparent;
        border: none;
        color: #555555;
        padding: 2px 5px;
        font-size: 12px;
        border-radius: 3px;
        cursor: pointer;
      }
      .btn-toolbar-icon:hover {
        background: #e4e7eb;
        color: #111111;
      }
      .btn-toolbar-icon.active {
        background: rgba(30, 112, 191, 0.15);
        color: #1e70bf;
      }
      .path-input, .filter-input {
        height: 22px;
        font-size: 11px;
        padding: 2px 6px;
        background: #ffffff !important;
        border: 1px solid #d0d4dc !important;
        color: #222222 !important;
        border-radius: 2px;
      }
      .col-name {
        flex: 1 1 0%;
        min-width: 8em;
        overflow: hidden;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .file-icon {
        flex: 0 0 auto;
        line-height: 1;
      }
      .file-name {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: #1a1a1a;
        font-size: 12px;
        line-height: 16px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }
      .col-size, .col-mode, .col-modified {
        color: #495057 !important;
        opacity: 1 !important;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .col-size {
        flex: 0 1 70px;
        width: 70px;
        min-width: 3.2em;
        text-align: right;
        font-size: 12px;
      }
      .col-mode {
        flex: 0 1 85px;
        width: 85px;
        min-width: 4em;
        text-align: center;
        font-size: 12px;
      }
      .col-modified {
        flex: 0 1 120px;
        width: 120px;
        min-width: 5em;
        text-align: right;
        font-size: 11.5px;
      }
      .file-row {
        cursor: pointer;
        user-select: none;
        transition: background 0.1s ease;
        height: 24px;
        outline: none;
        color: #222222;
      }
      .file-row:hover {
        background: #f0f2f5;
      }
      .file-row.selected {
        background: #e6f7ff !important;
        border: 1px solid #91d5ff !important;
      }
      .file-row:focus {
        background: #e6f7ff !important;
        outline: 1px dotted #1e70bf;
      }

      /* Context Menu */
      .sftp-context-menu {
        position: fixed;
        z-index: 20000;
        background: #ffffff;
        border: 1px solid #d0d4dc;
        border-radius: 4px;
        padding: 4px 0;
        min-width: 160px;
        font-size: 12px;
        color: #222222;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
        user-select: none;
      }
      .sftp-context-menu .ctx-item {
        padding: 5px 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: pointer;
        color: #222222;
      }
      .sftp-context-menu .ctx-item:hover {
        background: #1e70bf;
        color: #ffffff;
      }
      .sftp-context-menu .ctx-item:hover .ctx-shortcut {
        color: #ffffff;
      }
      .sftp-context-menu .ctx-shortcut {
        font-size: 10px;
        color: #888888;
        margin-left: 12px;
      }
      .sftp-context-menu .ctx-divider {
        height: 1px;
        background: #e4e7eb;
        margin: 4px 0;
      }
      .modal-dialog-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.45);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 30000;
      }
      .modal-dialog-backdrop .card {
        background: #ffffff !important;
        color: #222222 !important;
        border: 1px solid #d0d4dc !important;
      }
      .modal-dialog-backdrop .form-control {
        background: #ffffff !important;
        border-color: #d0d4dc !important;
        color: #222222 !important;
      }
    `,
  ],
})
export class WorkbenchSftpPaneComponent implements OnInit, OnDestroy {
  @Input() store!: TransferStore
  @Input() activeTab: any
  @Input() dockMode: 'bottom' | 'right' | 'full' | 'undock' = 'bottom'
  @Output() dockModeChange = new EventEmitter<'bottom' | 'right' | 'full' | 'undock' | 'close'>()
  @Output() backToTerminal = new EventEmitter<void>()

  @HostListener('mousedown', ['$event'])
  @HostListener('mouseup', ['$event'])
  @HostListener('click', ['$event'])
  @HostListener('keydown', ['$event'])
  @HostListener('keyup', ['$event'])
  onInputInteraction(event: Event): void {
    const target = event.target as HTMLElement
    if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) {
      event.stopPropagation()
    }
  }

  views: SftpSessionView[] = []
  activeViewId = ''
  viewDisplayMode: 'single-tab' | 'split-horizontal' | 'split-vertical' = 'single-tab'

  // Context menu state
  showContextMenu = false
  contextMenuX = 0
  contextMenuY = 0
  contextMenuView: SftpSessionView | null = null
  contextMenuTarget: 'local' | 'remote' = 'local'
  contextMenuFile: SftpFileItem | null = null

  // Action Dialog state
  showActionModal = false
  actionModalView: SftpSessionView | null = null
  actionModalTitle = ''
  actionModalPrompt = ''
  actionModalValue = ''
  actionModalTarget: 'local' | 'remote' = 'local'
  actionModalType: 'newFolder' | 'newFile' | 'rename' | 'chmod' = 'newFolder'

  private realSftpSession: any = null
  isConnectingSftp = false
  isRemoteDragOver = false

  public tarChannel: TarChannel = new TarChannel({
    hasSsh: () => !!this.getSshSession(),
    getSshSession: () => this.getSshSession(),
    getSftpSession: () => this.realSftpSession,
  })

  getSshSession(): any {
    const tab = this.activeTab
    if (!tab) return null
    return (
      (tab as any).sshSession ||
      (tab as any).session?.sshSession ||
      (tab as any).session?.ssh ||
      (tab as any).session
    )
  }

  private subs: Subscription[] = []
  private sftpConnectingPromise: Promise<any> | null = null

  uploader = new OverwriteUploader()
  auditLog: TransferAuditLog | null = null
  previewText: string | null = null
  previewNotice = ''
  showConflictModal = false
  conflictFileName = ''
  private conflictResolver: ((decision: ConflictDecision) => void) | null = null
  conflictChooser: ((name: string) => Promise<ConflictDecision>) | null = null
  readonly contextActions = SFTP_CONTEXT_ACTIONS

  constructor(
    public clipboard: CrossTransferClipboard,
    private relay: CrossTransferRelayService,
    private notifications: NotificationsService,
    @Optional() private config?: ConfigService,
    @Optional() public i18n?: I18nService
  ) {}

  t(path: string, fallback?: string): string {
    return this.i18n?.t(path, fallback) || fallback || path
  }

  async getRealSftpSession(): Promise<any> {
    if (this.realSftpSession) {
      return this.realSftpSession
    }
    if (this.sftpConnectingPromise) {
      return this.sftpConnectingPromise
    }
    const tab = this.activeTab
    if (!tab) return null
    const sshSession = (tab as any).sshSession || (tab as any).session?.ssh || (tab as any).session?.sshSession
    if (sshSession && typeof sshSession.openSFTP === 'function') {
      this.isConnectingSftp = true
      this.sftpConnectingPromise = (async () => {
        try {
          const sftp = await sshSession.openSFTP()
          this.realSftpSession = sftp
          if (this.realSftpSession?.closed$) {
            const sub = this.realSftpSession.closed$.subscribe(() => {
              this.realSftpSession = null
            })
            this.subs.push(sub)
          }
          return this.realSftpSession
        } catch (err) {
          console.warn('[Workbench SFTP] Could not open real SFTP session', err)
          return null
        } finally {
          this.isConnectingSftp = false
          this.sftpConnectingPromise = null
        }
      })()
      return this.sftpConnectingPromise
    }
    return null
  }

  resolveInitialRemotePath(): string {
    const custom = this.activeTab?.profile?.options?.secureWorkbench?.sftp?.initialRemotePath
    if (custom) return custom
    const user = this.activeTab?.profile?.options?.user
    if (user === 'root') return '/root'
    if (user) return `/home/${user}`
    return '/'
  }

  private fileTransferConfig() {
    return (
      this.config?.store?.secureWorkbench?.fileTransfer || DEFAULT_WORKBENCH_CONFIG.fileTransfer
    )
  }

  private profileId(): string {
    return this.activeTab?.profile?.id || this.activeTab?.profile?.name || 'default'
  }

  resolveStartPathsSync(workingDirectory?: string | null) {
    const ft = this.fileTransferConfig()
    const memory = this.config?.store?.secureWorkbench?.pathMemory?.[this.profileId()]
    const profileRemote = this.activeTab?.profile?.options?.secureWorkbench?.sftp?.initialRemotePath
    const defaultsRemote = ft.defaultRemotePath || profileRemote || this.resolveInitialRemotePath()
    const defaultsLocal = ft.defaultLocalPath || os.homedir()
    return resolveStartPaths({
      mode: ft.pathMode,
      defaultLocal: defaultsLocal,
      defaultRemote: defaultsRemote,
      remembered: memory,
      workingDirectory,
    })
  }

  rememberPaths(view: SftpSessionView): void {
    const mode = this.fileTransferConfig().pathMode
    if (mode === 'off') return
    const store = this.config?.store?.secureWorkbench
    if (!store) return
    if (!store.pathMemory) store.pathMemory = {}
    store.pathMemory[this.profileId()] = { localPath: view.localPath, remotePath: view.remotePath }
    this.config?.save?.()
  }

  saveBookmark(side: 'local' | 'remote'): void {
    const view = this.activeView
    if (!view) return
    const bookmark: SftpBookmark = {
      id: `bm-${Date.now()}`,
      profileId: this.profileId(),
      side,
      path: side === 'local' ? view.localPath : view.remotePath,
      title: side === 'local' ? view.localPath : view.remotePath,
    }
    const store = this.config?.store?.secureWorkbench
    if (store) {
      if (!Array.isArray(store.bookmarks)) store.bookmarks = []
      store.bookmarks.push(bookmark)
      this.config?.save?.()
    }
    this.notifications.info(this.t('sftp.bookmarkSaved', '书签已保存'))
  }

  openBookmark(bookmark: SftpBookmark): void {
    const view = this.activeView
    if (!view) return
    const next = applyBookmark(
      { localPath: view.localPath, remotePath: view.remotePath },
      bookmark
    )
    this.navigateTo(
      next.localPath !== view.localPath ? next.localPath : undefined,
      next.remotePath !== view.remotePath ? next.remotePath : undefined
    )
  }

  bookmarksForProfile(): SftpBookmark[] {
    const all: SftpBookmark[] = this.config?.store?.secureWorkbench?.bookmarks || []
    return all.filter(b => b.profileId === this.profileId())
  }

  ngOnInit(): void {
    const start = this.resolveStartPathsSync()
    const firstView = this.createView('视图 1', start.localPath || os.homedir(), start.remotePath)
    this.views = [firstView]
    this.activeViewId = firstView.id
    this.loadLocalFiles(firstView)
    this.loadRemoteFiles(firstView)

    if (start.needsWorkingDirectory && typeof this.activeTab?.session?.getWorkingDirectory === 'function') {
      this.activeTab.session.getWorkingDirectory().then((cwd: string) => {
        const again = this.resolveStartPathsSync(cwd)
        if (again.remotePath && again.remotePath !== firstView.remotePath) {
          firstView.remotePath = again.remotePath
          firstView.remotePathInput = again.remotePath
          this.loadRemoteFiles(firstView)
          this.rememberPaths(firstView)
        }
      }).catch(() => {})
    }

    if (this.activeTab && (this.activeTab as any).sessionChanged$) {
      this.subs.push(
        (this.activeTab as any).sessionChanged$.subscribe(() => {
          this.realSftpSession = null
          this.loadRemoteFiles()
        })
      )
    }
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe())
    this.subs = []
    this.realSftpSession = null
    this.sftpConnectingPromise = null
  }

  get activeView(): SftpSessionView {
    return this.views.find((v) => v.id === this.activeViewId) || this.views[0]
  }

  get displayedViews(): SftpSessionView[] {
    if (this.viewDisplayMode === 'single-tab') {
      return this.activeView ? [this.activeView] : []
    }
    return this.views
  }

  // --- View Management ---
  createView(title?: string, localPath = os.homedir(), remotePath = '/root'): SftpSessionView {
    const id = `view-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
    return {
      id,
      title: title || `视图 ${this.views.length + 1}`,
      localPath,
      localPathInput: localPath,
      remotePath,
      remotePathInput: remotePath,
      showHiddenLocal: false,
      showHiddenRemote: false,
      filterLocal: '',
      filterRemote: '',
      sortKeyLocal: 'name',
      sortAscLocal: true,
      sortKeyRemote: 'name',
      sortAscRemote: true,
      localFiles: [],
      remoteFiles: [],
      filteredLocalFiles: [],
      filteredRemoteFiles: [],
      selectedLocalFile: null,
      selectedRemoteFile: null,
    }
  }

  addNewView(): void {
    const active = this.activeView || this.views[0]
    const newView = this.createView(
      `视图 ${this.views.length + 1}`,
      active ? active.localPath : os.homedir(),
      active ? active.remotePath : '/root'
    )
    this.views.push(newView)
    this.activeViewId = newView.id
    this.loadLocalFiles(newView)
    this.loadRemoteFiles(newView)
    this.notifications.info(`已开启新视图: ${newView.title}`)
  }

  closeView(viewId: string, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation()
    }
    if (this.views.length <= 1) {
      this.notifications.notice('至少保留一个视图窗口')
      return
    }
    const idx = this.views.findIndex((v) => v.id === viewId)
    if (idx !== -1) {
      this.views.splice(idx, 1)
      if (this.activeViewId === viewId) {
        this.activeViewId = this.views[Math.max(0, idx - 1)].id
      }
    }
    if (this.views.length <= 1) {
      this.viewDisplayMode = 'single-tab'
    }
  }

  setActiveView(id: string): void {
    this.activeViewId = id
  }

  getPathBasename(p: string): string {
    if (!p) return ''
    const trimmed = p.replace(/[\\/]+$/, '')
    if (!trimmed) return p
    const parts = trimmed.split(/[\\/]/)
    return parts[parts.length - 1] || p
  }

  applyDirectoryPair(pair: { localPath?: string; remotePath?: string }): void {
    const view = this.activeView
    if (!view) return
    const next = applyPartialPair(
      { localPath: view.localPath, remotePath: view.remotePath },
      pair
    )
    this.navigateTo(
      next.localPath !== view.localPath ? next.localPath : undefined,
      next.remotePath !== view.remotePath ? next.remotePath : undefined
    )
  }

  public navigateTo(localPath?: string, remotePath?: string): void {
    const v = this.activeView
    if (!v) return
    if (localPath) {
      v.localPath = localPath
      v.localPathInput = localPath
      this.loadLocalFiles(v)
    }
    if (remotePath) {
      v.remotePath = remotePath
      v.remotePathInput = remotePath
      this.loadRemoteFiles(v)
    }
  }

  // --- Local File Operations ---
  loadLocalFiles(v?: SftpSessionView): void {
    const view = v || this.activeView
    if (!view) return
    try {
      if (!fs.existsSync(view.localPath)) {
        view.localPath = os.homedir()
      }
      view.localPathInput = view.localPath
      const names = fs.readdirSync(view.localPath)
      const items: SftpFileItem[] = []

      if (path.dirname(view.localPath) !== view.localPath) {
        items.push({ name: '..', isDirectory: true, size: 0, mode: 'drwxr-xr-x' })
      }

      for (const n of names) {
        if (!view.showHiddenLocal && n.startsWith('.') && n !== '..') {
          continue
        }
        try {
          const full = path.join(view.localPath, n)
          const isAsar = n.toLowerCase().endsWith('.asar')
          let st: any = null
          if (isAsar && originalFs) {
            try {
              st = originalFs.statSync(full)
            } catch {}
          }
          if (!st) {
            st = fs.statSync(full)
          }

          const isDir = isAsar ? false : st.isDirectory()
          const fileSize = isDir ? 0 : (st.size || 0)
          const modeStr =
            (isDir ? 'd' : '-') +
            (st.mode & 0o400 ? 'r' : '-') +
            (st.mode & 0o200 ? 'w' : '-') +
            (st.mode & 0o100 ? 'x' : '-') +
            (st.mode & 0o040 ? 'r' : '-') +
            (st.mode & 0o020 ? 'w' : '-') +
            (st.mode & 0o010 ? 'x' : '-') +
            (st.mode & 0o004 ? 'r' : '-') +
            (st.mode & 0o002 ? 'w' : '-') +
            (st.mode & 0o001 ? 'x' : '-')

          const modDate = new Date(st.mtimeMs)
          const modStr = `${modDate.getFullYear()}-${(modDate.getMonth() + 1).toString().padStart(2, '0')}-${modDate.getDate().toString().padStart(2, '0')} ${modDate.getHours().toString().padStart(2, '0')}:${modDate.getMinutes().toString().padStart(2, '0')}`

          items.push({
            name: n,
            isDirectory: isDir,
            size: fileSize,
            mode: modeStr,
            modified: modStr,
            modifiedMs: st.mtimeMs,
          })
        } catch {}
      }

      view.localFiles = items
      this.applyLocalFilter(view)
      view.selectedLocalFile = null
    } catch (err) {
      console.warn('[SFTP+] Failed reading local dir', err)
    }
  }

  applyLocalFilter(view: SftpSessionView): void {
    const q = view.filterLocal.toLowerCase().trim()
    let list = view.localFiles
    if (q) {
      list = list.filter((f) => f.name === '..' || f.name.toLowerCase().includes(q))
    }
    view.filteredLocalFiles = this.sortItemList(list, view.sortKeyLocal, view.sortAscLocal)
  }

  goUpLocal(view: SftpSessionView): void {
    const parent = path.dirname(view.localPath)
    if (parent && parent !== view.localPath) {
      view.localPath = parent
      this.loadLocalFiles(view)
    }
  }

  goHomeLocal(view: SftpSessionView): void {
    view.localPath = os.homedir()
    this.loadLocalFiles(view)
  }

  applyLocalPathInput(view: SftpSessionView): void {
    const target = view.localPathInput.trim()
    if (target && fs.existsSync(target)) {
      view.localPath = target
      this.loadLocalFiles(view)
    } else {
      this.notifications.error('本地路径不存在')
    }
  }

  // --- Remote File Operations ---
  private formatPermissions(mode: number, isDir: boolean): string {
    const prefix = isDir ? 'd' : '-'
    const rwx = (m: number) => {
      return (m & 4 ? 'r' : '-') + (m & 2 ? 'w' : '-') + (m & 1 ? 'x' : '-')
    }
    const u = rwx((mode >> 6) & 7)
    const g = rwx((mode >> 3) & 7)
    const o = rwx(mode & 7)
    return prefix + u + g + o
  }

  private formatDate(d: Date): string {
    if (!d || isNaN(d.getTime())) return ''
    const pad = (n: number) => (n < 10 ? '0' + n : '' + n)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  async loadRemoteFiles(v?: SftpSessionView): Promise<void> {
    const view = v || this.activeView
    if (!view) return
    view.remotePathInput = view.remotePath

    const sftp = await this.getRealSftpSession()
    if (sftp) {
      try {
        const rawFiles = await sftp.readdir(view.remotePath)
        const items: SftpFileItem[] = (rawFiles || []).map((f: any) => {
          const isDir = f.isDirectory === true
          return {
            name: f.name,
            isDirectory: isDir,
            size: f.size || 0,
            mode: typeof f.mode === 'number' ? this.formatPermissions(f.mode, isDir) : (f.mode || (isDir ? 'drwxr-xr-x' : '-rw-r--r--')),
            modified: f.modified ? this.formatDate(new Date(f.modified)) : '',
            modifiedMs: f.modified ? new Date(f.modified).getTime() : 0,
          }
        })

        if (view.remotePath !== '/' && !items.some((f) => f.name === '..')) {
          items.unshift({
            name: '..',
            isDirectory: true,
            size: 0,
            mode: 'drwxr-xr-x',
            modified: '',
            modifiedMs: 0,
          })
        }

        let filtered = items
        if (!view.showHiddenRemote) {
          filtered = filtered.filter((f) => f.name === '..' || !f.name.startsWith('.'))
        }

        view.remoteFiles = filtered
        this.applyRemoteFilter(view)
        view.selectedRemoteFile = null
        return
      } catch (err: any) {
        console.warn('[Workbench SFTP] Failed to readdir:', view.remotePath, err)
        // If /root failed, try / as fallback
        if (view.remotePath === '/root') {
          view.remotePath = '/'
          view.remotePathInput = '/'
          try {
            const rawFiles = await sftp.readdir('/')
            const items: SftpFileItem[] = (rawFiles || []).map((f: any) => {
              const isDir = f.isDirectory === true
              return {
                name: f.name,
                isDirectory: isDir,
                size: f.size || 0,
                mode: typeof f.mode === 'number' ? this.formatPermissions(f.mode, isDir) : (f.mode || (isDir ? 'drwxr-xr-x' : '-rw-r--r--')),
                modified: f.modified ? this.formatDate(new Date(f.modified)) : '',
                modifiedMs: f.modified ? new Date(f.modified).getTime() : 0,
              }
            })
            view.remoteFiles = !view.showHiddenRemote ? items.filter((f) => !f.name.startsWith('.')) : items
            this.applyRemoteFilter(view)
            view.selectedRemoteFile = null
            return
          } catch {}
        }
        this.notifications.error(`无法读取远程目录 ${view.remotePath}: ${err?.message || err}`)
      }
    }

    // If no real SFTP session is available, clear remote list (no fake mock data!)
    view.remoteFiles = []
    this.applyRemoteFilter(view)
    view.selectedRemoteFile = null
  }

  applyRemoteFilter(view: SftpSessionView): void {
    const q = view.filterRemote.toLowerCase().trim()
    let list = view.remoteFiles
    if (q) {
      list = list.filter((f) => f.name === '..' || f.name.toLowerCase().includes(q))
    }
    view.filteredRemoteFiles = this.sortItemList(list, view.sortKeyRemote, view.sortAscRemote)
  }

  goUpRemote(view: SftpSessionView): void {
    const parent = path.posix.dirname(view.remotePath)
    if (parent && parent !== view.remotePath) {
      view.remotePath = parent
      this.loadRemoteFiles(view)
    }
  }

  goHomeRemote(view: SftpSessionView): void {
    view.remotePath = this.resolveInitialRemotePath()
    this.loadRemoteFiles(view)
  }

  applyRemotePathInput(view: SftpSessionView): void {
    const target = view.remotePathInput.trim()
    if (target) {
      view.remotePath = target
      this.loadRemoteFiles(view)
    }
  }

  // --- Sorting Helper ---
  sortFiles(view: SftpSessionView, pane: 'local' | 'remote', key: 'name' | 'size' | 'modified'): void {
    if (pane === 'local') {
      if (view.sortKeyLocal === key) {
        view.sortAscLocal = !view.sortAscLocal
      } else {
        view.sortKeyLocal = key
        view.sortAscLocal = true
      }
      this.applyLocalFilter(view)
    } else {
      if (view.sortKeyRemote === key) {
        view.sortAscRemote = !view.sortAscRemote
      } else {
        view.sortKeyRemote = key
        view.sortAscRemote = true
      }
      this.applyRemoteFilter(view)
    }
  }

  getSortIcon(view: SftpSessionView, pane: 'local' | 'remote', key: 'name' | 'size' | 'modified'): string {
    const activeKey = pane === 'local' ? view.sortKeyLocal : view.sortKeyRemote
    const isAsc = pane === 'local' ? view.sortAscLocal : view.sortAscRemote
    if (activeKey !== key) return ''
    return isAsc ? '▲' : '▼'
  }

  private sortItemList(
    items: SftpFileItem[],
    key: 'name' | 'size' | 'modified',
    asc: boolean
  ): SftpFileItem[] {
    return [...items].sort((a, b) => {
      if (a.name === '..') return -1
      if (b.name === '..') return 1
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1

      let res = 0
      if (key === 'name') {
        res = a.name.localeCompare(b.name)
      } else if (key === 'size') {
        res = a.size - b.size
      } else if (key === 'modified') {
        res = (a.modifiedMs || 0) - (b.modifiedMs || 0)
      }
      return asc ? res : -res
    })
  }

  // --- Double-Click Navigation & Transfer ---
  onDblClickLocal(view: SftpSessionView, file: SftpFileItem): void {
    if (file.isDirectory) {
      view.localPath = path.resolve(view.localPath, file.name)
      this.loadLocalFiles(view)
      this.rememberPaths(view)
      return
    }
    const outcome = previewOutcome(this.fileTransferConfig().doubleClickAction, {
      isDirectory: false,
      size: file.size,
      textLike: true,
    })
    if (outcome === 'preview') {
      this.previewLocalFile(view, file)
      return
    }
    if (outcome === 'too-large' || outcome === 'not-text') {
      this.previewNotice = this.t('sftp.previewUnavailable', '无法预览该文件')
      this.notifications.info(this.previewNotice)
      return
    }
    view.selectedLocalFile = file
    this.uploadSelectedFile(view)
  }

  onDblClickRemote(view: SftpSessionView, file: SftpFileItem): void {
    if (file.isDirectory) {
      view.remotePath = path.posix.resolve(view.remotePath, file.name)
      this.loadRemoteFiles(view)
      this.rememberPaths(view)
      return
    }
    const outcome = previewOutcome(this.fileTransferConfig().doubleClickAction, {
      isDirectory: false,
      size: file.size,
      textLike: true,
    })
    if (outcome === 'preview') {
      void this.previewRemoteFile(view, file)
      return
    }
    if (outcome === 'too-large' || outcome === 'not-text') {
      this.previewNotice = this.t('sftp.previewUnavailable', '无法预览该文件')
      this.notifications.info(this.previewNotice)
      return
    }
    view.selectedRemoteFile = file
    this.downloadSelectedFile(view)
  }

  previewLocalFile(view: SftpSessionView, file: SftpFileItem): void {
    if (file.size > PREVIEW_MAX_BYTES) {
      this.previewNotice = this.t('sftp.previewTooLarge', '文件超过 256KB，不能预览')
      this.notifications.info(this.previewNotice)
      return
    }
    const full = path.join(view.localPath, file.name)
    const buf = fs.readFileSync(full)
    if (!looksLikeText(buf)) {
      this.previewNotice = this.t('sftp.previewUnavailable', '无法预览该文件')
      this.notifications.info(this.previewNotice)
      return
    }
    this.previewText = buf.toString('utf8')
  }

  async previewRemoteFile(view: SftpSessionView, file: SftpFileItem): Promise<void> {
    if (file.size > PREVIEW_MAX_BYTES) {
      this.previewNotice = this.t('sftp.previewTooLarge', '文件超过 256KB，不能预览')
      this.notifications.info(this.previewNotice)
      return
    }
    const sftp = await this.getRealSftpSession()
    if (!sftp) {
      this.previewNotice = this.t('sftp.previewUnavailable', '无法预览该文件')
      this.notifications.error(this.previewNotice)
      return
    }
    const remotePath = path.posix.join(view.remotePath, file.name)
    const handle = await sftp.open(remotePath, 1)
    const chunks: Buffer[] = []
    let total = 0
    while (total <= PREVIEW_MAX_BYTES) {
      const chunk = await handle.read()
      if (!chunk || chunk.length === 0) break
      const buf = Buffer.from(chunk)
      chunks.push(buf)
      total += buf.length
    }
    await handle.close()
    const all = Buffer.concat(chunks)
    if (!looksLikeText(all)) {
      this.previewNotice = this.t('sftp.previewUnavailable', '无法预览该文件')
      this.notifications.info(this.previewNotice)
      return
    }
    this.previewText = all.toString('utf8')
  }

  // --- Upload / Download / Copy / Paste (Sharing TransferStore) ---
  async uploadSelectedFile(view: SftpSessionView): Promise<void> {
    if (!view.selectedLocalFile || !this.store) return
    const file = view.selectedLocalFile
    if (file.isDirectory) {
      await this.uploadDirectory(view, file, true)
      return
    }
    const src = path.join(view.localPath, file.name)
    await this.uploadSingleFilePath(view, src)
  }

  private ensureAudit(): TransferAuditLog {
    if (this.auditLog) return this.auditLog
    const dir =
      this.config?.store?.secureWorkbench?.logging?.directory ||
      path.join(os.homedir(), '.tabby-logs')
    this.auditLog = new TransferAuditLog(auditFilePath(dir), this.activeTab?.id || 'sftp', this.activeTab?.title || 'sftp')
    return this.auditLog
  }

  private askConflict(name: string): Promise<ConflictDecision> {
    if (this.conflictChooser) return this.conflictChooser(name)
    this.conflictFileName = name
    this.showConflictModal = true
    return new Promise(resolve => {
      this.conflictResolver = resolve
    })
  }

  chooseConflict(decision: ConflictDecision): void {
    this.showConflictModal = false
    const resolve = this.conflictResolver
    this.conflictResolver = null
    resolve?.(decision)
  }

  async uploadSingleFilePath(view: SftpSessionView, src: string): Promise<void> {
    if (!this.store) return
    const fileName = path.basename(src)
    const dst = path.posix.join(view.remotePath, fileName)
    let fileSize = 1024
    try {
      const isAsar = fileName.toLowerCase().endsWith('.asar')
      if (isAsar && originalFs) fileSize = originalFs.statSync(src).size
      else fileSize = fs.statSync(src).size
    } catch {}

    const taskId = `up-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    this.store.addTask({
      id: taskId,
      name: `${fileName} (上传)`,
      sourcePath: src,
      targetPath: dst,
      direction: 'upload',
      totalBytes: fileSize,
    })
    this.store.updateTaskStatus(taskId, 'running')
    this.ensureAudit().record('start', taskId, src, dst)

    const sftp = await this.getRealSftpSession()
    if (!sftp) {
      this.store.updateTaskStatus(taskId, 'failed', '未建立远程 SFTP 会话')
      this.ensureAudit().record('fail', taskId, src, dst, { error: 'no-session' })
      this.notifications.error('上传失败: 未建立远程 SFTP 会话')
      return
    }

    const client = adaptSftpSession(sftp)
    let exists = false
    try {
      const st = await client.lstat(dst)
      if (st.isSymbolicLink() || st.isDirectory()) {
        exists = true
      } else {
        exists = true
      }
    } catch (err) {
      if (!isMissingRemoteFile(err)) {
        this.store.updateTaskStatus(taskId, 'failed', (err as any)?.message)
        this.ensureAudit().record('fail', taskId, src, dst, { error: (err as any)?.message })
        return
      }
    }

    if (exists) {
      const action = this.fileTransferConfig().conflictAction
      const prompted = action === 'prompt' ? await this.askConflict(fileName) : null
      const decision = decideConflict(action, prompted)
      this.ensureAudit().record('conflict-decision', taskId, src, dst, { decision })
      if (decision !== 'overwrite') {
        this.store.updateTaskStatus(taskId, 'cancelled', decision === 'skip' ? 'skipped by conflict policy' : 'cancelled')
        this.ensureAudit().record('cancel', taskId, src, dst, { decision })
        return
      }
    }

    try {
      await this.uploader.uploadWithAtomicOverwrite(client, src, dst, {
        onProgress: bytes => this.store.updateProgress(taskId, Math.min(bytes, fileSize)),
      })
      this.store.updateTaskStatus(taskId, 'succeeded')
      this.ensureAudit().record('complete', taskId, src, dst)
      this.notifications.info(`上传完成: ${fileName}`)
      this.loadRemoteFiles(view)
    } catch (err: any) {
      this.store.updateTaskStatus(taskId, 'failed', err?.message)
      this.ensureAudit().record('fail', taskId, src, dst, { error: err?.message })
      this.notifications.error(`上传失败: ${err?.message || err}`)
    }
  }

  async uploadDirectory(view: SftpSessionView, file: SftpFileItem, preferTar = true): Promise<void> {
    const localDir = path.join(view.localPath, file.name)
    await this.uploadDirectoryFromPath(view, localDir, preferTar)
  }

  async uploadDirectoryFromPath(view: SftpSessionView, localPath: string, preferTar = true): Promise<void> {
    if (!this.store) return
    const baseName = path.basename(localPath)
    const remoteTarget = path.posix.join(view.remotePath, baseName)

    const scan = this.tarChannel.scanLocalDir(localPath)
    const totalBytes = scan.size > 0 ? scan.size : 1024 * 1024
    const taskId = `up-dir-${Date.now()}`

    this.store.addTask({
      id: taskId,
      name: `📁 ${baseName} (目录上传)`,
      sourcePath: localPath,
      targetPath: remoteTarget,
      direction: 'upload',
      totalBytes: totalBytes,
    })
    this.store.updateTaskStatus(taskId, 'running')
    this.ensureAudit().record('start', taskId, localPath, remoteTarget)

    let done = false
    if (preferTar) {
      try {
        const result = await this.tarChannel.tryUploadDir(localPath, remoteTarget, this.store, taskId)
        if (result === 'succeeded') {
          this.store.updateProgress(taskId, totalBytes)
          this.store.updateTaskStatus(taskId, 'succeeded')
          this.ensureAudit().record('complete', taskId, localPath, remoteTarget)
          this.notifications.info(`目录上传完成 (tar压缩加速): ${baseName}`)
          this.loadRemoteFiles(view)
          done = true
        } else {
          console.log('[SFTP+] tar acceleration fallback to regular upload:', localPath)
        }
      } catch (err) {
        console.warn('[SFTP+] tar upload error, falling back:', err)
      }
    }

    if (!done) {
      await this.uploadDirectoryRegular(view, localPath, remoteTarget, taskId, totalBytes)
    }
  }

  async uploadDirectoryRegular(
    view: SftpSessionView,
    localPath: string,
    remoteTarget: string,
    taskId: string,
    totalBytes?: number
  ): Promise<void> {
    const sftp = await this.getRealSftpSession()
    if (!sftp) {
      this.store.updateTaskStatus(taskId, 'failed', '未建立远程 SFTP 会话')
      this.ensureAudit().record('fail', taskId, localPath, remoteTarget, { error: 'no-session' })
      this.notifications.error('目录上传失败: 未建立远程 SFTP 会话')
      return
    }

    const client = adaptSftpSession(sftp)
    const baseName = path.basename(localPath)
    let processedBytes = 0

    const uploadRecursive = async (srcDir: string, dstDir: string) => {
      try {
        await sftp.mkdir(dstDir)
      } catch {}

      const entries = fs.readdirSync(srcDir, { withFileTypes: true })
      for (const entry of entries) {
        const srcItem = path.join(srcDir, entry.name)
        const dstItem = path.posix.join(dstDir, entry.name)
        const isAsar = entry.name.toLowerCase().endsWith('.asar')
        if (entry.isDirectory() && !isAsar) {
          await uploadRecursive(srcItem, dstItem)
          continue
        }
        try {
          const st = fs.statSync(srcItem)
          let exists = false
          try {
            await client.lstat(dstItem)
            exists = true
          } catch (err) {
            if (!isMissingRemoteFile(err)) throw err
          }
          if (exists) {
            const action = this.fileTransferConfig().conflictAction
            const prompted = action === 'prompt' ? await this.askConflict(entry.name) : null
            const decision = decideConflict(action, prompted)
            this.ensureAudit().record('conflict-decision', taskId, srcItem, dstItem, { decision })
            if (decision !== 'overwrite') continue
          }
          const fileBase = processedBytes
          await this.uploader.uploadWithAtomicOverwrite(client, srcItem, dstItem, {
            onProgress: bytes => {
              this.store.updateProgress(taskId, Math.min(fileBase + bytes, totalBytes || fileBase + bytes))
            },
          })
          processedBytes += st.size
        } catch (fileErr: any) {
          throw new Error(`${srcItem}: ${fileErr?.message || fileErr}`)
        }
      }
    }

    try {
      await uploadRecursive(localPath, remoteTarget)
      this.store.updateTaskStatus(taskId, 'succeeded')
      this.ensureAudit().record('complete', taskId, localPath, remoteTarget)
      this.notifications.info(`目录上传完成: ${baseName}`)
      this.loadRemoteFiles(view)
    } catch (err: any) {
      this.store.updateTaskStatus(taskId, 'failed', err?.message)
      this.ensureAudit().record('fail', taskId, localPath, remoteTarget, { error: err?.message })
      this.notifications.error(`目录上传失败: ${err?.message || err}`)
    }
  }

  async downloadSelectedFile(view: SftpSessionView): Promise<void> {
    if (!view.selectedRemoteFile || !this.store) return
    const file = view.selectedRemoteFile
    if (file.isDirectory) {
      await this.downloadDirectory(view, file, true)
      return
    }
    const src = path.posix.join(view.remotePath, file.name)
    const dst = path.join(view.localPath, file.name)

    const taskId = `dl-${Date.now()}`
    this.store.addTask({
      id: taskId,
      name: `${file.name} (下载)`,
      sourcePath: src,
      targetPath: dst,
      direction: 'download',
      totalBytes: file.size || 2048,
    })

    this.store.updateTaskStatus(taskId, 'running')

    const sftp = await this.getRealSftpSession()
    if (!sftp) {
      this.store.updateTaskStatus(taskId, 'failed', '未建立远程 SFTP 会话')
      this.notifications.error('下载失败: 未建立远程 SFTP 会话')
      return
    }

    try {
      const handle = await sftp.open(src, 1)
      const fd = fs.openSync(dst, 'w')
      let pos = 0
      while (true) {
        const chunk = await handle.read()
        if (!chunk || chunk.length === 0) break
        fs.writeSync(fd, Buffer.from(chunk))
        pos += chunk.length
        this.store.updateProgress(taskId, Math.min(pos, file.size || pos))
      }
      fs.closeSync(fd)
      await handle.close()
      this.store.updateTaskStatus(taskId, 'succeeded')
      this.notifications.info(`下载完成: ${file.name}`)
      this.loadLocalFiles(view)
    } catch (err: any) {
      this.store.updateTaskStatus(taskId, 'failed', err?.message)
      this.notifications.error(`下载失败: ${err?.message || err}`)
    }
  }

  async downloadDirectory(view: SftpSessionView, file: SftpFileItem, preferTar = true): Promise<void> {
    if (!this.store) return
    const remoteDir = path.posix.join(view.remotePath, file.name)
    const localTarget = path.join(view.localPath, file.name)
    const taskId = `dl-dir-${Date.now()}`

    this.store.addTask({
      id: taskId,
      name: `📁 ${file.name} (目录下载)`,
      sourcePath: remoteDir,
      targetPath: localTarget,
      direction: 'download',
      totalBytes: file.size || 2 * 1024 * 1024,
    })
    this.store.updateTaskStatus(taskId, 'running')

    let done = false
    if (preferTar) {
      try {
        const result = await this.tarChannel.tryDownloadDir(remoteDir, localTarget, this.store, taskId)
        if (result === 'succeeded') {
          this.store.updateTaskStatus(taskId, 'succeeded')
          this.notifications.info(`目录下载完成 (tar压缩加速): ${file.name}`)
          this.loadLocalFiles(view)
          done = true
        } else {
          console.log('[SFTP+] tar download fallback to regular download:', remoteDir)
        }
      } catch (err) {
        console.warn('[SFTP+] tar download error, falling back:', err)
      }
    }

    if (!done) {
      await this.downloadDirectoryRegular(view, remoteDir, localTarget, taskId)
    }
  }

  async downloadDirectoryRegular(
    view: SftpSessionView,
    remoteDir: string,
    localTarget: string,
    taskId: string
  ): Promise<void> {
    const sftp = await this.getRealSftpSession()
    if (!sftp) {
      this.store.updateTaskStatus(taskId, 'failed', '未建立远程 SFTP 会话')
      this.notifications.error('目录下载失败: 未建立远程 SFTP 会话')
      return
    }

    const baseName = path.posix.basename(remoteDir)
    let processedBytes = 0

    const downloadRecursive = async (rDir: string, lDir: string) => {
      fs.mkdirSync(lDir, { recursive: true })
      let entries: any[] = []
      try {
        entries = await sftp.readdir(rDir)
      } catch (err: any) {
        throw new Error(`${rDir}: ${err?.message || err}`)
      }

      for (const entry of entries) {
        if (entry.name === '.' || entry.name === '..') continue
        const rItem = path.posix.join(rDir, entry.name)
        const lItem = path.join(lDir, entry.name)
        const isDir = entry.isDirectory
          ? typeof entry.isDirectory === 'function'
            ? entry.isDirectory()
            : entry.isDirectory
          : entry.attrs?.isDirectory
          ? typeof entry.attrs.isDirectory === 'function'
            ? entry.attrs.isDirectory()
            : entry.attrs.isDirectory
          : false

        if (isDir) {
          await downloadRecursive(rItem, lItem)
        } else {
          try {
            const handle = await sftp.open(rItem, 1)
            const fd = fs.openSync(lItem, 'w')
            while (true) {
              const chunk = await handle.read()
              if (!chunk || chunk.length === 0) break
              fs.writeSync(fd, Buffer.from(chunk))
              processedBytes += chunk.length
              this.store.updateProgress(taskId, processedBytes)
            }
            fs.closeSync(fd)
            await handle.close()
          } catch (fileErr: any) {
            throw new Error(`${rItem}: ${fileErr?.message || fileErr}`)
          }
        }
      }
    }

    try {
      await downloadRecursive(remoteDir, localTarget)
      this.store.updateTaskStatus(taskId, 'succeeded')
      this.notifications.info(`目录下载完成: ${baseName}`)
      this.loadLocalFiles(view)
    } catch (err: any) {
      this.store.updateTaskStatus(taskId, 'failed', err?.message)
      this.notifications.error(`目录下载失败: ${err?.message || err}`)
    }
  }

  triggerDirectoryPicker(view: SftpSessionView): void {
    try {
      // @ts-ignore
      const electron = typeof window !== 'undefined' && (window as any).require ? (window as any).require('electron') : null
      const dialog = electron?.remote?.dialog
      if (dialog && typeof dialog.showOpenDialog === 'function') {
        dialog
          .showOpenDialog({
            properties: ['openDirectory'],
            defaultPath: view.localPath,
          })
          .then((result: any) => {
            if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
              this.uploadDirectoryFromPath(view, result.filePaths[0], true)
            }
          })
        return
      }
    } catch {}

    const input = document.getElementById('workbench-sftp-dir-picker') as HTMLInputElement
    if (input) {
      input.value = ''
      input.click()
    }
  }

  onDirectoryPicked(view: SftpSessionView, event: any): void {
    const files = event.target?.files
    if (files && files.length > 0) {
      const firstFile = files[0]
      const filePath = (firstFile as any).path
      if (filePath) {
        const dirPath = path.dirname(filePath)
        this.uploadDirectoryFromPath(view, dirPath, true)
      }
    }
  }

  onDragOverRemote(ev: DragEvent): void {
    ev.preventDefault()
    ev.stopPropagation()
    this.isRemoteDragOver = true
  }

  onDragLeaveRemote(ev: DragEvent): void {
    ev.preventDefault()
    ev.stopPropagation()
    this.isRemoteDragOver = false
  }

  async onDropRemote(ev: DragEvent, view: SftpSessionView): Promise<void> {
    ev.preventDefault()
    ev.stopPropagation()
    this.isRemoteDragOver = false
    if (!ev.dataTransfer?.files) return
    const files = Array.from(ev.dataTransfer.files)
    for (const file of files) {
      const p = (file as any).path
      if (p) {
        try {
          const isAsar = p.toLowerCase().endsWith('.asar')
          const isDir = !isAsar && fs.statSync(p).isDirectory()
          if (isDir) {
            await this.uploadDirectoryFromPath(view, p, true)
          } else {
            await this.uploadSingleFilePath(view, p)
          }
        } catch {
          await this.uploadSingleFilePath(view, p)
        }
      }
    }
  }

  async copyRemoteFile(view: SftpSessionView): Promise<void> {
    if (!view.selectedRemoteFile) return
    const file = view.selectedRemoteFile
    const sftp = await this.getRealSftpSession()
    if (!sftp) {
      this.notifications.error('未建立远程 SFTP 会话，无法复制')
      return
    }
    const sessionName = this.activeTab?.title || 'SSH-Session'
    const fullRemotePath = path.posix.join(view.remotePath, file.name)

    this.clipboard.copy({
      sourceSessionId: this.activeTab?.id || 'tab-source',
      sourceSessionName: sessionName,
      sourceClientRef: sftp,
      remotePath: fullRemotePath,
      fileName: file.name,
      isDirectory: file.isDirectory,
      size: file.size,
      copiedAt: new Date(),
    })

    if (sftp.closed$) {
      const sub = sftp.closed$.subscribe(() => {
        const current = this.clipboard.getItem()
        if (current?.sourceClientRef === sftp) this.clipboard.clear()
      })
      this.subs.push(sub)
    }

    this.notifications.info(this.t('sftp.copied', `已复制远程文件: ${file.name}`))
  }

  async pasteFromOtherConnection(view?: SftpSessionView): Promise<void> {
    const v = view || this.activeView
    const item = this.clipboard.getItem()
    if (!item) {
      this.notifications.error(this.t('sftp.emptyClipboard', '剪贴板没有可粘贴的远程文件'))
      return
    }
    if (!this.store || !v) return

    const targetSftp = await this.getRealSftpSession()
    if (!targetSftp) {
      this.notifications.error('未建立远程 SFTP 会话，无法跨连接粘贴')
      return
    }
    if (!item.sourceClientRef || item.sourceClientRef.closed) {
      const taskId = `relay-missing-${Date.now()}`
      this.store.addTask({
        id: taskId,
        name: `Cross-Copy: ${item.fileName}`,
        sourcePath: item.remotePath,
        targetPath: v.remotePath,
        direction: 'cross-remote',
        totalBytes: item.size || 0,
      })
      this.store.updateTaskStatus(taskId, 'failed', '源会话已不可用')
      this.notifications.error('源会话已不可用，无法跨连接粘贴')
      return
    }

    try {
      await this.relay.executeRemotePaste({
        sourceClient: item.sourceClientRef,
        targetClient: adaptSftpSession(targetSftp),
        targetDirectory: v.remotePath,
        targetStore: this.store,
      })
      this.notifications.info(`跨连接传输完成: ${item.fileName}`)
      this.loadRemoteFiles(v)
    } catch (err: any) {
      this.notifications.error(`跨连接传输失败: ${err?.message || err}`)
    }
  }

  // --- Modal Operations (New Folder, New File, Rename, Chmod) ---
  openNewFolderDialog(view: SftpSessionView, target: 'local' | 'remote'): void {
    this.actionModalView = view
    this.actionModalTarget = target
    this.actionModalType = 'newFolder'
    this.actionModalTitle = target === 'local' ? '新建本地文件夹' : '新建远程文件夹'
    this.actionModalPrompt = '请输入新文件夹名称:'
    this.actionModalValue = ''
    this.showActionModal = true
  }

  openNewFileDialog(view: SftpSessionView, target: 'local' | 'remote'): void {
    this.actionModalView = view
    this.actionModalTarget = target
    this.actionModalType = 'newFile'
    this.actionModalTitle = target === 'local' ? '新建本地文件' : '新建远程文件'
    this.actionModalPrompt = '请输入新文件名称:'
    this.actionModalValue = ''
    this.showActionModal = true
  }

  openRenameDialog(view: SftpSessionView, target: 'local' | 'remote'): void {
    const file = target === 'local' ? view.selectedLocalFile : view.selectedRemoteFile
    if (!file) return
    this.actionModalView = view
    this.actionModalTarget = target
    this.actionModalType = 'rename'
    this.actionModalTitle = `重命名 ${file.name}`
    this.actionModalPrompt = '请输入新名称:'
    this.actionModalValue = file.name
    this.showActionModal = true
  }

  openChmodDialog(view: SftpSessionView): void {
    if (!view.selectedRemoteFile) return
    this.actionModalView = view
    this.actionModalTarget = 'remote'
    this.actionModalType = 'chmod'
    this.actionModalTitle = `修改权限 (chmod): ${view.selectedRemoteFile.name}`
    this.actionModalPrompt = '请输入八进制权限 (如 0755, 0644):'
    this.actionModalValue = '0755'
    this.showActionModal = true
  }

  async confirmActionModal(): Promise<void> {
    const val = this.actionModalValue.trim()
    const view = this.actionModalView
    if (!val || !view) return

    const sftp = await this.getRealSftpSession()

    if (this.actionModalType === 'newFolder') {
      if (this.actionModalTarget === 'local') {
        const full = path.join(view.localPath, val)
        try {
          fs.mkdirSync(full, { recursive: true })
          this.loadLocalFiles(view)
          this.notifications.info(`已创建文件夹: ${val}`)
        } catch (err) {
          this.notifications.error(`创建失败: ${err}`)
        }
      } else {
        if (sftp) {
          try {
            await sftp.mkdir(path.posix.join(view.remotePath, val))
            this.notifications.info(`已创建远程文件夹: ${val}`)
            this.loadRemoteFiles(view)
          } catch (err: any) {
            this.notifications.error(`创建远程文件夹失败: ${err?.message || err}`)
          }
        } else {
          this.notifications.error('创建远程文件夹失败: 未建立远程 SFTP 会话')
        }
      }
    } else if (this.actionModalType === 'newFile') {
      if (this.actionModalTarget === 'local') {
        const full = path.join(view.localPath, val)
        try {
          fs.writeFileSync(full, '')
          this.loadLocalFiles(view)
          this.notifications.info(`已创建文件: ${val}`)
        } catch (err) {
          this.notifications.error(`创建失败: ${err}`)
        }
      } else {
        if (sftp) {
          try {
            const h = await sftp.open(path.posix.join(view.remotePath, val), 2 | 8)
            await h.close()
            this.notifications.info(`已创建远程文件: ${val}`)
            this.loadRemoteFiles(view)
          } catch (err: any) {
            this.notifications.error(`创建远程文件失败: ${err?.message || err}`)
          }
        } else {
          this.notifications.error('创建远程文件失败: 未建立远程 SFTP 会话')
        }
      }
    } else if (this.actionModalType === 'rename') {
      if (this.actionModalTarget === 'local' && view.selectedLocalFile) {
        const oldFull = path.join(view.localPath, view.selectedLocalFile.name)
        const newFull = path.join(view.localPath, val)
        try {
          fs.renameSync(oldFull, newFull)
          this.loadLocalFiles(view)
          this.notifications.info(`已重命名为: ${val}`)
        } catch (err) {
          this.notifications.error(`重命名失败: ${err}`)
        }
      } else if (this.actionModalTarget === 'remote' && view.selectedRemoteFile) {
        if (sftp) {
          try {
            await sftp.rename(
              path.posix.join(view.remotePath, view.selectedRemoteFile.name),
              path.posix.join(view.remotePath, val)
            )
            this.notifications.info(`已重命名为: ${val}`)
            this.loadRemoteFiles(view)
          } catch (err: any) {
            this.notifications.error(`重命名失败: ${err?.message || err}`)
          }
        } else {
          this.notifications.error('重命名失败: 未建立远程 SFTP 会话')
        }
      }
    } else if (this.actionModalType === 'chmod' && view.selectedRemoteFile) {
      if (sftp) {
        try {
          const parsed = parseInt(val, 8) || parseInt(val, 10)
          await sftp.chmod(path.posix.join(view.remotePath, view.selectedRemoteFile.name), parsed)
          this.notifications.info(`已修改权限为: ${val}`)
          this.loadRemoteFiles(view)
        } catch (err: any) {
          this.notifications.error(`修改权限失败: ${err?.message || err}`)
        }
      } else {
        this.notifications.error('修改权限失败: 未建立远程 SFTP 会话')
      }
    }

    this.showActionModal = false
  }

  deleteSelectedLocal(view: SftpSessionView): void {
    if (!view.selectedLocalFile || view.selectedLocalFile.name === '..') return
    const file = view.selectedLocalFile
    const full = path.join(view.localPath, file.name)
    try {
      if (file.isDirectory) {
        fs.rmdirSync(full, { recursive: true })
      } else {
        fs.unlinkSync(full)
      }
      this.notifications.info(`已删除: ${file.name}`)
      this.loadLocalFiles(view)
    } catch (err) {
      this.notifications.error(`删除失败: ${err}`)
    }
  }

  async deleteSelectedRemote(view: SftpSessionView): Promise<void> {
    if (!view.selectedRemoteFile || view.selectedRemoteFile.name === '..') return
    const file = view.selectedRemoteFile
    const sftp = await this.getRealSftpSession()
    if (!sftp) {
      this.notifications.error('未建立远程 SFTP 会话，无法删除项目')
      return
    }

    try {
      const remoteTarget = path.posix.join(view.remotePath, file.name)
      if (file.isDirectory) {
        await sftp.rmdir(remoteTarget)
      } else {
        await sftp.unlink(remoteTarget)
      }
      this.notifications.info(`已删除远程项目: ${file.name}`)
      this.loadRemoteFiles(view)
    } catch (err: any) {
      this.notifications.error(`删除失败: ${err?.message || err}`)
    }
  }

  formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }

  setDockMode(mode: 'bottom' | 'right' | 'full' | 'undock' | 'close'): void {
    if (mode !== 'close') {
      this.dockMode = mode
    }
    this.dockModeChange.emit(mode)
  }

  onEnterFile(view: SftpSessionView, file: SftpFileItem, target: 'local' | 'remote'): void {
    if (file.isDirectory) {
      if (target === 'local') {
        view.localPath = path.resolve(view.localPath, file.name)
        this.loadLocalFiles(view)
      } else {
        view.remotePath = path.posix.resolve(view.remotePath, file.name)
        this.loadRemoteFiles(view)
      }
      return
    }

    if (target === 'local') {
      view.selectedLocalFile = file
      const ok = window.confirm(`确定上传 "${file.name}" 到远程目录 "${view.remotePath}" 吗？`)
      if (ok) {
        this.uploadSelectedFile(view)
      }
    } else {
      view.selectedRemoteFile = file
      const ok = window.confirm(`确定下载 "${file.name}" 到本地目录 "${view.localPath}" 吗？`)
      if (ok) {
        this.downloadSelectedFile(view)
      }
    }
  }

  onFileContextMenu(ev: MouseEvent, view: SftpSessionView, file: SftpFileItem, target: 'local' | 'remote'): void {
    ev.preventDefault()
    ev.stopPropagation()
    this.setActiveView(view.id)
    if (target === 'local') {
      view.selectedLocalFile = file
    } else {
      view.selectedRemoteFile = file
    }
    this.contextMenuView = view
    this.contextMenuFile = file
    this.contextMenuTarget = target
    this.contextMenuX = ev.clientX
    this.contextMenuY = ev.clientY
    this.showContextMenu = true
  }

  onPaneContextMenu(ev: MouseEvent, view: SftpSessionView, target: 'local' | 'remote'): void {
    ev.preventDefault()
    ev.stopPropagation()
    this.setActiveView(view.id)
    this.contextMenuView = view
    this.contextMenuFile = null
    this.contextMenuTarget = target
    this.contextMenuX = ev.clientX
    this.contextMenuY = ev.clientY
    this.showContextMenu = true
  }

  closeContextMenu(): void {
    this.showContextMenu = false
  }

  contextUpload(): void {
    if (this.contextMenuFile && this.contextMenuView) {
      this.contextMenuView.selectedLocalFile = this.contextMenuFile
      const ok = window.confirm(
        `确定上传 "${this.contextMenuFile.name}" 到远程目录 "${this.contextMenuView.remotePath}" 吗？`
      )
      if (ok) {
        this.uploadSelectedFile(this.contextMenuView)
      }
    }
    this.closeContextMenu()
  }

  contextUploadDirectory(preferTar = true): void {
    if (this.contextMenuFile && this.contextMenuView) {
      this.contextMenuView.selectedLocalFile = this.contextMenuFile
      const method = preferTar ? '压缩打包加速上传 (tar)' : '常规递归逐文件上传'
      const ok = window.confirm(
        `确定使用【${method}】将目录 "${this.contextMenuFile.name}" 上传到远程 "${this.contextMenuView.remotePath}" 吗？`
      )
      if (ok) {
        this.uploadDirectory(this.contextMenuView, this.contextMenuFile, preferTar)
      }
    }
    this.closeContextMenu()
  }

  contextDownload(): void {
    if (this.contextMenuFile && this.contextMenuView) {
      this.contextMenuView.selectedRemoteFile = this.contextMenuFile
      const ok = window.confirm(
        `确定下载 "${this.contextMenuFile.name}" 到本地目录 "${this.contextMenuView.localPath}" 吗？`
      )
      if (ok) {
        this.downloadSelectedFile(this.contextMenuView)
      }
    }
    this.closeContextMenu()
  }

  contextDownloadDirectory(preferTar = true): void {
    if (this.contextMenuFile && this.contextMenuView) {
      this.contextMenuView.selectedRemoteFile = this.contextMenuFile
      const method = preferTar ? '压缩打包加速下载 (tar)' : '常规递归逐文件下载'
      const ok = window.confirm(
        `确定使用【${method}】将远程目录 "${this.contextMenuFile.name}" 下载到本地 "${this.contextMenuView.localPath}" 吗？`
      )
      if (ok) {
        this.downloadDirectory(this.contextMenuView, this.contextMenuFile, preferTar)
      }
    }
    this.closeContextMenu()
  }
}
